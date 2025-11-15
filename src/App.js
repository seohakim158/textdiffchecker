import React, { useState, useEffect, useRef, useCallback } from "react";
import DiffMatchPatch from "diff-match-patch";
import VersionHistory from "./version";

function App() {
  // --- State: text and diff output ---
  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [diffHtml, setDiffHtml] = useState("");
  const [correctLetters, setCorrectLetters] = useState(0);
  const [totalLetters, setTotalLetters] = useState(0);
  const [matchPercent, setMatchPercent] = useState(0);

  // --- State: options ---
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignorePunctuation, setIgnorePunctuation] = useState(false);
  const [memoriser, setMemoriser] = useState(false);

  // --- State: UI ---
  const [zenMode, setZenMode] = useState(false);
  const [showModified, setShowModified] = useState(false);
  const [resultsShown, setResultsShown] = useState(false);
  const [hoverTopLeft, setHoverTopLeft] = useState(false);
  const [hoverTopRight, setHoverTopRight] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [bounceIgnoreCase, setBounceIgnoreCase] = useState(false);
  const [bounceIgnorePunctuation, setBounceIgnorePunctuation] = useState(false);
  const [bounceMemoriser, setBounceMemoriser] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [hoverRightEdge, setHoverRightEdge] = useState(false);
  const [trayItems, setTrayItems] = useState([]);
  const [bounceNewText, setBounceNewText] = useState(false);
  const [glowingItemId, setGlowingItemId] = useState(null);
  const [trayLoaded, setTrayLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetItem, setDeleteTargetItem] = useState(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  // --- Refs ---
  const lastOldTextRef = useRef("");
  const lastNewTextRef = useRef("");

  // --- Effects: localStorage loading and saving ---
  useEffect(() => {
    const savedOld = localStorage.getItem("diff_oldText");
    const savedNew = localStorage.getItem("diff_newText");
    const savedOptions = JSON.parse(localStorage.getItem("diff_options") || "{}");
    if (savedOld) setOldText(savedOld);
    if (savedNew) setNewText(savedNew);
    if (savedOptions.ignoreCase !== undefined) setIgnoreCase(savedOptions.ignoreCase);
    if (savedOptions.ignorePunctuation !== undefined) setIgnorePunctuation(savedOptions.ignorePunctuation);
    if (savedOptions.memoriser !== undefined) setMemoriser(savedOptions.memoriser);
    const savedTray = JSON.parse(localStorage.getItem("diff_trayItems") || "[]");
    if (Array.isArray(savedTray)) setTrayItems(savedTray);
    setTrayLoaded(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("diff_oldText", oldText);
    localStorage.setItem("diff_newText", newText);
    localStorage.setItem("diff_options", JSON.stringify({
      ignoreCase,
      ignorePunctuation,
      memoriser,
    }));
  }, [oldText, newText, ignoreCase, ignorePunctuation, memoriser]);

  useEffect(() => {
    if (!trayLoaded) return;
    localStorage.setItem("diff_trayItems", JSON.stringify(trayItems));
  }, [trayItems, trayLoaded]);

  // --- Main diff handler ---
  const handleDiffCore = useCallback(() => {
    function preprocessForCompare(text) {
      let result = text;
      if (ignoreCase) result = result.toLowerCase();
      if (ignorePunctuation) result = result.replace(/\p{P}/gu, "");
      return result;
    }

    const escapeHtml = (s) =>
      (s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const calculateStatsFromHtml = (html) => {
      let correct = 0, total = 0, inSpan = false, i = 0;
      while (i < html.length) {
        if (!inSpan && html.startsWith("<span", i)) {
          inSpan = true;
          const close = html.indexOf(">", i);
          i = close >= 0 ? close + 1 : i + 1;
          continue;
        }
        if (inSpan && html.startsWith("</span>", i)) {
          inSpan = false;
          i += 7;
          continue;
        }
        if (html[i] === "<") {
          const close = html.indexOf(">", i);
          i = close >= 0 ? close + 1 : i + 1;
          continue;
        }
        if (!/\s/.test(html[i])) {
          if (!inSpan) correct++;
          total++;
        }
        i++;
      }
      return { correctLetters: correct, totalLetters: total, matchPercent: total ? (correct / total) * 100 : 0 };
    };

    // --- Core: diff with ignore case/punctuation for comparison, original for display ---
    function buildDiffWithHighlights(orig, mod, ignoreCase, ignorePunctuation) {
      const origComp = preprocessForCompare(orig);
      const modComp = preprocessForCompare(mod);
      function buildMap(raw, processed) {
        let map = [];
        let r = 0, p = 0;
        while (r < raw.length && p < processed.length) {
          let rawChar = raw[r];
          let procChar = processed[p];
          if (ignoreCase) rawChar = rawChar.toLowerCase();
          if (ignorePunctuation && /\p{P}/u.test(rawChar)) {
            r++;
            continue;
          }
          if (rawChar === procChar) {
            map.push(r);
            r++;
            p++;
          } else {
            if (/\s/.test(raw[r])) {
              r++;
            } else {
              map.push(r);
              r++;
              p++;
            }
          }
        }
        while (map.length < processed.length) map.push(r);
        return map;
      }
      const origMap = buildMap(orig, origComp);
      const modMap = buildMap(mod, modComp);
      const dmp = new DiffMatchPatch();
      const diffs = dmp.diff_main(origComp, modComp);
      dmp.diff_cleanupSemantic(diffs);
      let html = "";
      let oCompIdx = 0, mCompIdx = 0;
      for (const [op, data] of diffs) {
        if (op === DiffMatchPatch.DIFF_EQUAL) {
          const len = data.length;
          if (len === 0) continue;
          const start = oCompIdx < origMap.length ? origMap[oCompIdx] : orig.length;
          const end = (oCompIdx + len - 1) < origMap.length ? origMap[oCompIdx + len - 1] + 1 : orig.length;
          html += escapeHtml(orig.slice(start, end));
          oCompIdx += len;
          mCompIdx += len;
        } else if (op === DiffMatchPatch.DIFF_DELETE) {
          const len = data.length;
          if (len === 0) continue;
          const start = oCompIdx < origMap.length ? origMap[oCompIdx] : orig.length;
          const end = (oCompIdx + len - 1) < origMap.length ? origMap[oCompIdx + len - 1] + 1 : orig.length;
          const s = orig.slice(start, end);
          html += s.trim()
            ? `<span class="del" style="background:#dc3545;color:white;text-decoration:line-through;padding:2px;border-radius:3px;">${escapeHtml(s)}</span>`
            : escapeHtml(s);
          oCompIdx += len;
        } else if (op === DiffMatchPatch.DIFF_INSERT) {
          const len = data.length;
          if (len === 0) continue;
          const start = mCompIdx < modMap.length ? modMap[mCompIdx] : mod.length;
          const end = (mCompIdx + len - 1) < modMap.length ? modMap[mCompIdx + len - 1] + 1 : mod.length;
          const s = mod.slice(start, end);
          html += s.trim()
            ? `<span class="ins" style="background:#28a745;color:black;padding:2px;border-radius:3px;">${escapeHtml(s)}</span>`
            : escapeHtml(s);
          mCompIdx += len;
        }
      }
      return html;
    }

    const applyContextMode = (html) => {
      const words = html.split(/\s+/);
      const highlightIdx = [];
      words.forEach((w, i) => {
        if (w.includes('class="ins"') || w.includes('class="del"')) highlightIdx.push(i);
      });
      if (!highlightIdx.length) return words.slice(0, Math.min(3, words.length)).join(" ");
      const chunks = [];
      for (const idx of highlightIdx) {
        const from = Math.max(0, idx - 3);
        const to = Math.min(words.length - 1, idx + 3);
        if (!chunks.length) chunks.push([from, to]);
        else {
          const last = chunks[chunks.length - 1];
          if (from <= last[1] + 1) last[1] = Math.max(last[1], to);
          else chunks.push([from, to]);
        }
      }
      let ellipsisStart = false, ellipsisEnd = false;
      if (chunks[0][0] > 0) ellipsisStart = true;
      if (chunks[0][0] > 3) ellipsisStart = true;
      if (chunks[chunks.length - 1][1] < words.length - 1) ellipsisEnd = true;
      if (chunks[chunks.length - 1][1] < words.length - 4) ellipsisEnd = true;
      let chunkHtml = chunks.map(([from, to]) => words.slice(from, to + 1).join(" ")).join("<br/><br/>...<br/><br/>");
      if (ellipsisStart) chunkHtml = "...<br/><br/>" + chunkHtml;
      if (ellipsisEnd) chunkHtml = chunkHtml + "<br/><br/>...";
      return chunkHtml;
    };

    const original = oldText || "";
    const modified = newText || "";

    if (!memoriser) {
      const html = buildDiffWithHighlights(original, modified, ignoreCase, ignorePunctuation);
      const stats = calculateStatsFromHtml(html);
      setDiffHtml(html);
      setCorrectLetters(stats.correctLetters);
      setTotalLetters(stats.totalLetters);
      setMatchPercent(stats.matchPercent);
      lastOldTextRef.current = oldText;
      lastNewTextRef.current = newText;
      return;
    }

    // --- Memoriser mode ---
    const origWords = original.split(/\s+/).filter(Boolean);
    const modWords = modified.split(/\s+/).filter(Boolean);
    const typedWords = modWords.slice(0, origWords.length);
    const memHtmlFull = buildDiffWithHighlights(original, typedWords.join(" "), ignoreCase, ignorePunctuation);
    const memStats = calculateStatsFromHtml(memHtmlFull);
    const nmHtmlFull = buildDiffWithHighlights(original, modified, ignoreCase, ignorePunctuation);
    const nmStats = calculateStatsFromHtml(nmHtmlFull);
    let chosenHtml, chosenStats;
    if (memStats.matchPercent >= nmStats.matchPercent) {
      chosenHtml = memHtmlFull;
      chosenStats = memStats;
    } else {
      chosenHtml = nmHtmlFull;
      chosenStats = nmStats;
    }
    if (memoriser && chosenStats.matchPercent === 100) {
      setDiffHtml("");
      setCorrectLetters(chosenStats.correctLetters);
      setTotalLetters(chosenStats.totalLetters);
      setMatchPercent(chosenStats.matchPercent);
      lastOldTextRef.current = oldText;
      lastNewTextRef.current = newText;
      return;
    }
    const finalHtml = applyContextMode(chosenHtml);
    setDiffHtml(finalHtml);
    setCorrectLetters(chosenStats.correctLetters);
    setTotalLetters(chosenStats.totalLetters);
    setMatchPercent(chosenStats.matchPercent);
    lastOldTextRef.current = oldText;
    lastNewTextRef.current = newText;
  }, [oldText, newText, memoriser, ignoreCase, ignorePunctuation]);

  // --- Keydown handler (memoized) ---
  const handleKeyDown = useCallback((e) => {
    const isMod = e.metaKey || e.ctrlKey;
    if (!isMod) return;
    switch (e.key) {
      case "\\":
        e.preventDefault();
        if (!window._zenKeyPressed) {
          window._zenKeyPressed = true;
          setZenMode(prev => !prev);
          setTimeout(() => { window._zenKeyPressed = false; }, 50);
        }
        break;
      case "Enter":
        e.preventDefault();
        if (!window._cmdEnterPressed) {
          window._cmdEnterPressed = true;
          if (
            resultsShown &&
            oldText === lastOldTextRef.current &&
            newText === lastNewTextRef.current
          ) {
            setResultsShown(false);
          } else {
            handleDiffCore();
            setResultsShown(true);
          }
          setTimeout(() => { window._cmdEnterPressed = false; }, 50);
        }
        break;
      case "t":
        e.preventDefault();
        setShowSidebar(prev => !prev);
        break;
      case "m":
        e.preventDefault();
        setShowModified(prev => !prev);
        break;
      default:
        break;
    }
  }, [resultsShown, oldText, newText, handleDiffCore, setResultsShown]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // --- Event handlers ---
  const handleTypingOld = (e) => {
    setOldText(e.target.value);
    if (resultsShown) setResultsShown(false);
  };
  const handleTypingNew = (e) => {
    setNewText(e.target.value);
    if (resultsShown) setResultsShown(false);
  };
  const handleToggleIgnoreCase = () => {
    if (resultsShown) setResultsShown(false);
    setIgnoreCase(!ignoreCase);
    setBounceIgnoreCase(true);
    setTimeout(() => setBounceIgnoreCase(false), 300);
  };
  const handleToggleIgnorePunctuation = () => {
    if (resultsShown) setResultsShown(false);
    setIgnorePunctuation(!ignorePunctuation);
    setBounceIgnorePunctuation(true);
    setTimeout(() => setBounceIgnorePunctuation(false), 300);
  };
  const handleToggleMemoriser = () => {
    if (resultsShown) setResultsShown(false);
    setMemoriser(prev => !prev);
    setBounceMemoriser(true);
    setTimeout(() => setBounceMemoriser(false), 300);
  };
  const handleAddToTray = () => {
    if (newText.trim() === "") return;
    if (trayItems.some(i => i.text === newText.trim())) {
      setShowDuplicateDialog(true);
      return;
    }
    const newItem = {
      id: Date.now(),
      text: newText.trim(),
      timestamp: new Date().toISOString()
    };
    setTrayItems(prev => [newItem, ...prev].slice(0, 20));
  };
  const handleTrayItemClick = (item) => {
    setGlowingItemId(item.id);
    setTimeout(() => {
      setNewText(item.text);
      setBounceNewText(true);
      setGlowingItemId(null);
      setTimeout(() => setBounceNewText(false), 1000);
      if (resultsShown) setResultsShown(false);
    }, 500);
  };
  const truncateText = (text, maxLength = 100) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#000",
        color: "white",
        fontFamily: "'Courier New', Courier, monospace",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px",
        paddingTop: "70px",
        textAlign: "center",
        position: "relative",
      }}
    >
      {/* Top left corner - Zen button */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "120px",
          height: "80px",
        }}
        onMouseEnter={() => setHoverTopLeft(true)}
        onMouseLeave={() => setHoverTopLeft(false)}
      >
        {hoverTopLeft && (
          <button
            style={{
              position: "absolute",
              top: "10px",
              left: "10px",
              backgroundColor: "black",
              border: "1px solid #FFF",
              borderRadius: "50%",
              width: "50px",
              height: "50px",
              padding: "0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "1.2rem",
              cursor: "pointer",
              animation: "zoomIn 0.2s forwards",
              transition: "background-color 0.2s, color 0.2s, border-color 0.2s, transform 0.2s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.backgroundColor = "white";
              e.currentTarget.style.color = "black";
              e.currentTarget.style.borderColor = "white";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.animation = "zoomOut 0.18s";
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.backgroundColor = "black";
              e.currentTarget.style.color = "white";
              e.currentTarget.style.borderColor = "white";
              setTimeout(() => {
                if (e.currentTarget) e.currentTarget.style.animation = "";
              }, 180);
            }}
            onClick={e => {
              setZenMode(prev => !prev); 
              e.currentTarget.style.animation = "zoomOut 0.18s";
              e.currentTarget.style.transform = "scale(1)";
              setTimeout(() => {
                if (e.currentTarget) e.currentTarget.style.animation = "";
              }, 180);
            }}
          >
            {/* Zen Mode Icon - Peaceful Circle/Lotus */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
              <line x1="12" y1="2" x2="12" y2="6"/>
              <line x1="12" y1="18" x2="12" y2="22"/>
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
              <line x1="2" y1="12" x2="6" y2="12"/>
              <line x1="18" y1="12" x2="22" y2="12"/>
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
            </svg>
          </button>
        )}
      </div>

      {/* Top right corner - Show Modified button */}
      {!zenMode && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: "120px",
            height: "80px",
          }}
          onMouseEnter={() => setHoverTopRight(true)}
          onMouseLeave={() => setHoverTopRight(false)}
        >
        {hoverTopRight && (
          <button
            onClick={e => {
              setShowModified(prev => !prev);
              e.currentTarget.style.animation = "zoomOut 0.18s";
              e.currentTarget.style.transform = "scale(1)";
              setTimeout(() => {
                if (e.currentTarget) e.currentTarget.style.animation = "";
              }, 180);
            }}
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              backgroundColor: "black",
              border: "1px solid #FFF",
              borderRadius: "50%",
              width: "50px",
              height: "50px",
              padding: "0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "1.2rem",
              cursor: "pointer",
              animation: "zoomIn 0.2s forwards",
              transition: "background-color 0.2s, color 0.2s, border-color 0.2s, transform 0.2s",
              boxShadow: "0 2px 8px rgba(0,0,0,0.13)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.backgroundColor = "white";
              e.currentTarget.style.color = "black";
              e.currentTarget.style.borderColor = "white";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.animation = "zoomOut 0.18s";
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.backgroundColor = "black";
              e.currentTarget.style.color = "white";
              e.currentTarget.style.borderColor = "white";
              setTimeout(() => {
                if (e.currentTarget) e.currentTarget.style.animation = "";
              }, 180);
            }}
          >
            {showModified ? (
              // Eye Open Icon
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            ) : (
              // Eye Closed Icon
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            )}
          </button>
        )}
      </div>
      )}

      {/* Right edge hover trigger */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          right: showSidebar ? "340px" : "-40px",
          transform: "translateY(-50%)",
          width: "100px",
          height: "200px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          cursor: "pointer",
          zIndex: 100,
          transition: "right 0.3s",
        }}
        onMouseEnter={() => setHoverRightEdge(true)}
        onMouseLeave={() => setHoverRightEdge(false)}
        onClick={() => setShowSidebar(!showSidebar)}
      >
        {(hoverRightEdge || showSidebar) && (
          <div
            style={{
              position: "absolute",
              right: showSidebar ? "0" : "40px",
              backgroundColor: "white",
              color: "black",
              padding: "5px 10px",
              borderRadius: "5px 0 0 5px",
              animation: showSidebar ? "none" : "slideInFromRight 0.2s forwards",
              transition: "right 0.3s",
            }}
          >
            {showSidebar ? ">" : "<"}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: showSidebar ? 0 : "-340px",
          width: "300px",
          height: "100vh",
          backgroundColor: "#111",
          borderLeft: "1px solid #333",
          padding: "20px",
          overflowY: "auto",
          zIndex: 99,
          transition: "right 0.3s",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: "20px" }}>Tray</h3>

        <div style={{ flex: 1, overflowY: "auto", marginBottom: "10px" }}>
          {trayItems.length === 0 ? (
            <p style={{ color: "#666" }}>No items yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {trayItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleTrayItemClick(item)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setDeleteTargetItem(item);
                    setShowDeleteConfirm(true);
                  }}
                  style={{
                    width: "100%",
                    borderRadius: "5px", 
                    border: "1px solid #333",
                    backgroundColor: glowingItemId === item.id ? "#fff" : "#222",
                    color: glowingItemId === item.id ? "#000" : "#fff",
                    padding: "10px",
                    marginBottom: "10px",
                    fontSize: "0.9rem",
                    fontFamily: "'Courier New', Courier, monospace",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "transform 0.2s, background-color 0.2s, color 0.2s, box-shadow 0.2s",
                    transformOrigin: "center",
                    boxShadow: glowingItemId === item.id ? "0 0 10px 2px rgba(30,144,255,0.7)" : "none",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.05)"; 
                    if (glowingItemId !== item.id) e.currentTarget.style.backgroundColor = "#333";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.backgroundColor = glowingItemId === item.id ? "#fff" : "#222";
                  }}
                >
                  {truncateText(item.text)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Move button just below the list */}
        <button
          onClick={handleAddToTray}
          style={{
            backgroundColor: "#1e90ff",
            border: "none",
            borderRadius: "5px",
            color: "white",
            padding: "10px",
            cursor: "pointer",
            fontSize: "1rem",
            fontFamily: "'Courier New', Courier, monospace",
            transition: "transform 0.2s",
            marginBottom: "40px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          Add to tray
        </button>
      </div>

      {!zenMode && (
        <>
          <h1 style={{ fontSize: "2.5rem", marginBottom: "10px" }}>
            Text Diff Checker
          </h1>
          <h2
            style={{
              fontSize: "1.2rem",
              fontWeight: "normal",
              color: "#ccc",
              marginBottom: "30px",
            }}
          >
            Created by seohakim158
          </h2>

          {/* Options */}
          <div style={{ marginBottom: "30px", display: "flex", gap: "30px" }}>
            <span
              onClick={handleToggleIgnoreCase}
              style={{
                color: ignoreCase ? "#1e90ff" : "white",
                cursor: "pointer",
                userSelect: "none",
                transition: "color 0.2s, transform 0.2s",
                animation: bounceIgnoreCase ? "bounce 0.3s" : "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              Ignore case
            </span>
            <span
              onClick={handleToggleIgnorePunctuation}
              style={{
                color: ignorePunctuation ? "#1e90ff" : "white",
                cursor: "pointer",
                userSelect: "none",
                transition: "color 0.2s, transform 0.2s",
                animation: bounceIgnorePunctuation ? "bounce 0.3s" : "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              Ignore punctuation
            </span>
            <span
              onClick={handleToggleMemoriser}
              style={{
                color: memoriser ? "#1e90ff" : "white",
                cursor: "pointer",
                userSelect: "none",
                transition: "color 0.2s, transform 0.2s",
                animation: bounceMemoriser ? "bounce 0.3s" : "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              Memoriser
            </span>
          </div>
        </>
      )}

      {zenMode && (
        <div style={{ marginBottom: "30px", height: "140px" }}></div>
      )}

      {/* Textareas */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          marginBottom: "30px",
          width: "100%",
          maxWidth: "700px",
        }}
      >
        <textarea
          style={{
            width: "100%",
            height: "140px",
            padding: "10px",
            borderRadius: "5px",
            border: "1px solid #333",
            backgroundColor: "#000",
            color: "white",
            fontSize: "1rem",
            resize: "none",
            boxSizing: "border-box",
            fontFamily: "'Courier New', Courier, monospace",
          }}
          placeholder="Original text..."
          value={oldText}
          onChange={handleTypingOld}
        />
        {showModified && !zenMode && (
          <textarea
            style={{
              width: "100%",
              height: "140px",
              padding: "10px",
              borderRadius: "5px",
              border: "1px solid #333",
              backgroundColor: bounceNewText ? "#fff" : "#000",
              color: bounceNewText ? "#000" : "white",
              fontSize: "1rem",
              resize: "none",
              boxSizing: "border-box",
              fontFamily: "'Courier New', Courier, monospace",
              transition: "background-color 1s, color 1s",
              animation: bounceNewText ? "bounceGlow 1s" : "none",
            }}
            placeholder="Modified text..."
            value={newText}
            onChange={handleTypingNew}
          />
        )}
      </div>

      {!zenMode && (
        <button
          onClick={() => {
            handleDiffCore();
            setResultsShown(true);
          }}
          style={{
            background: "linear-gradient(45deg, #1e90ff, #00bfff)",
            border: "none",
            padding: "10px 25px",
            borderRadius: "8px",
            color: "white",
            fontSize: "1.1rem",
            cursor: "pointer",
            transition: "transform 0.2s",
            fontFamily: "'Courier New', Courier, monospace",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
        >
          Check
        </button>
      )}

      {/* Diff results */}
      {resultsShown && (
        <div
          style={{
            marginTop: "30px",
            padding: "15px",
            borderRadius: "5px",
            border: "1px solid #333",
            backgroundColor: "#000",
            minHeight: "100px",
            width: "100%",
            maxWidth: "700px",
            boxSizing: "border-box",
            overflowX: "auto",
            textAlign: "left",
            fontFamily: "'Courier New', Courier, monospace",
          }}
          dangerouslySetInnerHTML={{ __html: diffHtml }}
        />
      )}

      {/* Bottom left corner - Version button (circular and animated like top buttons, hidden by default, show on hover/zoom) */}
      <div
        style={{
          position: "fixed",
          left: 0,
          bottom: 0,
          width: "120px",
          height: "80px",
          zIndex: 10,
        }}
        onMouseEnter={e => {
          const btn = document.getElementById("version-btn");
          if (btn) {
            btn.style.display = "flex";
            btn.style.animation = "zoomIn 0.2s forwards";
            btn.style.transform = "scale(1.05)";
            btn.style.backgroundColor = "black";
            btn.style.color = "white";
            btn.style.borderColor = "white";
          }
        }}
        onMouseLeave={e => {
          const btn = document.getElementById("version-btn");
          if (btn) {
            btn.style.animation = "zoomOut 0.18s";
            btn.style.transform = "scale(1)";
            btn.style.backgroundColor = "white";
            btn.style.color = "black";
            btn.style.borderColor = "#555";
            setTimeout(() => {
              if (btn) btn.style.animation = "";
              if (btn) btn.style.display = "none";
            }, 180);
          }
        }}
      >
        <button
          id="version-btn"
          style={{
            position: "absolute",
            left: "10px",
            bottom: "10px",
            backgroundColor: "white",
            border: "1px solid #555",
            borderRadius: "50%",
            width: "50px",
            height: "50px",
            padding: "0",
            display: "none",
            alignItems: "center",
            justifyContent: "center",
            color: "black",
            fontSize: "1.2rem",
            fontWeight: "bold",
            cursor: "pointer",
            fontFamily: "'Courier New', Courier, monospace",
            animation: "zoomIn 0.2s forwards",
            transition: "background-color 0.2s, color 0.2s, border-color 0.2s, transform 0.2s",
            boxShadow: "0 2px 8px rgba(0,0,0,0.13)",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.backgroundColor = "white";
            e.currentTarget.style.color = "black";
            e.currentTarget.style.borderColor = "white";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.animation = "zoomOut 0.18s";
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.backgroundColor = "black";
            e.currentTarget.style.color = "white";
            e.currentTarget.style.borderColor = "white";
            setTimeout(() => {
              if (e.currentTarget) e.currentTarget.style.animation = "";
            }, 180);
          }}
          onClick={e => {
            setShowHistory(true);
            e.currentTarget.style.animation = "zoomOut 0.18s";
            e.currentTarget.style.transform = "scale(1)";
            setTimeout(() => {
              if (e.currentTarget) e.currentTarget.style.animation = "";
            }, 180);
          }}
        >
            {/* Version History Icon - Clock with circular arrow */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
              <path d="M21 12a9 9 0 1 1-9-9"/>
              <polyline points="17 3 21 3 21 7"/>
            </svg>
          </button>
      </div>

      {/* Bottom right corner - GitHub button (circular and animated like top buttons, hidden by default, show on hover/zoom) */}
      <div
        style={{
          position: "fixed",
          right: 0,
          bottom: 0,
          width: "120px",
          height: "80px",
          zIndex: 10,
        }}
        onMouseEnter={e => {
          const btn = document.getElementById("github-btn");
          if (btn) {
            btn.style.display = "flex";
            btn.style.animation = "zoomIn 0.2s forwards";
            btn.style.transform = "scale(1.05)";
            btn.style.backgroundColor = "black";
            btn.style.color = "white";
            btn.style.borderColor = "white";
          }
        }}
        onMouseLeave={e => {
          const btn = document.getElementById("github-btn");
          if (btn) {
            btn.style.animation = "zoomOut 0.18s";
            btn.style.transform = "scale(1)";
            btn.style.backgroundColor = "white";
            btn.style.color = "black";
            btn.style.borderColor = "#555";
            setTimeout(() => {
              if (btn) btn.style.animation = "";
              if (btn) btn.style.display = "none";
            }, 180);
          }
        }}
      >
        <a
          href="https://github.com/seohakim158/textdiffchecker"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none" }}
        >
          <button
            id="github-btn"
            style={{
              position: "absolute",
              right: "10px",
              bottom: "10px",
              backgroundColor: "white",
              border: "1px solid #555",
              borderRadius: "50%",
              width: "50px",
              height: "50px",
              padding: "0",
              display: "none",
              alignItems: "center",
              justifyContent: "center",
              color: "black",
              fontSize: "1.2rem",
              fontWeight: "bold",
              cursor: "pointer",
              fontFamily: "'Courier New', Courier, monospace",
              animation: "zoomIn 0.2s forwards",
              transition: "background-color 0.2s, color 0.2s, border-color 0.2s, transform 0.2s",
              boxShadow: "0 2px 8px rgba(0,0,0,0.13)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.backgroundColor = "white";
              e.currentTarget.style.color = "black";
              e.currentTarget.style.borderColor = "white";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.animation = "zoomOut 0.18s";
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.backgroundColor = "black";
              e.currentTarget.style.color = "white";
              e.currentTarget.style.borderColor = "white";
              setTimeout(() => {
                if (e.currentTarget) e.currentTarget.style.animation = "";
              }, 180);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{}}
            >
              <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.429 2.865 8.187 6.839 9.504.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.157-1.11-1.465-1.11-1.465-.908-.62.069-.608.069-.608 1.004.07 1.533 1.032 1.533 1.032.892 1.53 2.341 1.089 2.91.833.092-.647.35-1.09.636-1.341-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.987 1.029-2.687-.103-.254-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.025 2.748-1.025.545 1.378.202 2.396.1 2.65.64.7 1.028 1.594 1.028 2.687 0 3.847-2.337 4.695-4.565 4.943.359.309.678.919.678 1.853 0 1.337-.012 2.418-.012 2.747 0 .267.18.577.688.48C19.138 20.204 22 16.447 22 12.021 22 6.484 17.523 2 12 2z"/>
            </svg>
          </button>
        </a>
      </div>

      {showHistory && <VersionHistory onClose={() => setShowHistory(false)} />}
      {resultsShown && (
        <div
          style={{
            marginTop: "20px",
            fontSize: "1.3rem",
            fontFamily: "'Courier New', Courier, monospace",
            fontWeight: "bold",
            color: `rgb(${255 - Math.round((matchPercent/100)*255)}, ${Math.round((matchPercent/100)*255)}, 0)`
          }}
        >
          {matchPercent.toFixed(1)}% ({correctLetters}/{totalLetters})
        </div>
      )}

      {showDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999
          }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            style={{
              backgroundColor: "#000",
              padding: "20px",
              borderRadius: "10px",
              minWidth: "300px",
              color: "white",
              border: "1px solid #333"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Delete item?</h3>
            <p style={{ fontSize: "0.9rem", opacity: 0.8 }}>
              "{truncateText(deleteTargetItem?.text, 50)}"
            </p>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "5px",
                  border: "none",
                  backgroundColor: "#1e90ff",
                  color: "white",
                  cursor: "pointer"
                }}
                onClick={() => {
                  setTrayItems(prev => prev.filter(i => i.id !== (deleteTargetItem?.id)));
                  setShowDeleteConfirm(false);
                }}
              >
                Delete
              </button>
              <button
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "5px",
                  border: "none",
                  backgroundColor: "#444",
                  color: "white",
                  cursor: "pointer"
                }}
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showDuplicateDialog && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 9999
          }}
          onClick={() => setShowDuplicateDialog(false)}
        >
          <div
            style={{
              backgroundColor: "#000",
              padding: "20px",
              borderRadius: "10px",
              border: "1px solid #333",
              minWidth: "280px",
              color: "white",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Already in tray</h3>
            <p style={{ opacity: 0.8 }}>This text already exists in your tray.</p>
            <button
              style={{
                marginTop: "20px",
                width: "100%",
                padding: "8px",
                borderRadius: "5px",
                border: "none",
                backgroundColor: "#1e90ff",
                color: "white",
                cursor: "pointer"
              }}
              onClick={() => setShowDuplicateDialog(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes bounce {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
          @keyframes zoomIn {
            from { transform: scale(0); }
            to { transform: scale(1); }
          }
          @keyframes zoomOut {
            from { transform: scale(1.05); }
            to { transform: scale(1); }
          }
          @keyframes slideInFromRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          @keyframes bounceGlow {
            0% { background-color: #000; color: white; transform: scale(1); }
            50% { background-color: #fff; color: #000; transform: scale(1.02); }
            100% { background-color: #000; color: white; transform: scale(1); }
          }
        `}
      </style>
    </div>
  );
}

export default App;