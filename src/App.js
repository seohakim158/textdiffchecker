import React, { useState, useEffect } from "react";
import DiffMatchPatch from "diff-match-patch";

function App() {
  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [diffHtml, setDiffHtml] = useState("");

  // Options
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignorePunctuation, setIgnorePunctuation] = useState(false);
  const [memoriser, setMemoriser] = useState(false);

  // Zen mode
  const [zenMode, setZenMode] = useState(false);

  // Show modified text toggle
  const [showModified, setShowModified] = useState(false);

  // Track if results have been shown
  const [resultsShown, setResultsShown] = useState(false);

  const lastOldTextRef = React.useRef("");
  const lastNewTextRef = React.useRef("");

  // Corner hover states
  const [hoverTopLeft, setHoverTopLeft] = useState(false);
  const [hoverTopRight, setHoverTopRight] = useState(false);
  const [hoverBottomLeft, setHoverBottomLeft] = useState(false);
  const [hoverBottomRight, setHoverBottomRight] = useState(false);

  // Edit history popup
  const [showHistory, setShowHistory] = useState(false);

  // Bounce animation trigger
  const [bounceIgnoreCase, setBounceIgnoreCase] = useState(false);
  const [bounceIgnorePunctuation, setBounceIgnorePunctuation] = useState(false);
  const [bounceMemoriser, setBounceMemoriser] = useState(false);

  // Sidebar state
  const [showSidebar, setShowSidebar] = useState(false);
  const [hoverRightEdge, setHoverRightEdge] = useState(false);
  const [trayItems, setTrayItems] = useState([]);
  const [bounceNewText, setBounceNewText] = useState(false);
  const [glowingItemId, setGlowingItemId] = useState(null);
  const [trayLoaded, setTrayLoaded] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetItem, setDeleteTargetItem] = useState(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  // Match percent state
  const [matchPercent, setMatchPercent] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      switch (e.key) {
        case "\\":
          e.preventDefault();
          // Prevent double execution
          if (!window._zenKeyPressed) {
            window._zenKeyPressed = true;
            setZenMode(prev => !prev);
            // Reset flag after a short delay
            setTimeout(() => { window._zenKeyPressed = false; }, 50);
          }
          break;
        case "Enter":
          e.preventDefault();
          // Prevent double execution
          if (!window._cmdEnterPressed) {
            window._cmdEnterPressed = true;
            if (
              resultsShown &&
              oldText === lastOldTextRef.current &&
              newText === lastNewTextRef.current
            ) {
              setResultsShown(false); // hide if already shown and text unchanged
            } else {
              handleDiff();            // compute diff
              setResultsShown(true);   // show results
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
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, );

  useEffect(() => {
    const savedOld = localStorage.getItem("diff_oldText");
    const savedNew = localStorage.getItem("diff_newText");
    const savedOptions = JSON.parse(localStorage.getItem("diff_options") || "{}");

    if (savedOld) setOldText(savedOld);
    if (savedNew) setNewText(savedNew);
    if (savedOptions.ignoreCase !== undefined) setIgnoreCase(savedOptions.ignoreCase);
    if (savedOptions.ignorePunctuation !== undefined) setIgnorePunctuation(savedOptions.ignorePunctuation);
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
    }));
  }, [oldText, newText, ignoreCase, ignorePunctuation]);

  useEffect(() => {
    if (!trayLoaded) return;
    localStorage.setItem("diff_trayItems", JSON.stringify(trayItems));
  }, [trayItems, trayLoaded]);

  const preprocess = (text) => {
    let result = text;
    if (ignoreCase) result = result.toLowerCase();
    if (ignorePunctuation)
      result = result.replace(/[.,!/#$%^&*;:{}=\-_`~()"]/g, "");
    return result;
  };

  const handleDiff = () => {
    if (
      resultsShown &&
      oldText === lastOldTextRef.current &&
      newText === lastNewTextRef.current
    ) {
      setResultsShown(false);
      return;
    }

    let original = oldText;
    let modified = newText;

    // Apply memoriser mode - limit to word count
    if (memoriser) {
      const origWords = original.split(/\s+/).filter(w => w.trim() !== "");
      const modWords = modified.split(/\s+/).filter(w => w.trim() !== "");
      const targetWordCount = Math.min(origWords.length, modWords.length);
      
      original = origWords.slice(0, targetWordCount).join(" ");
      modified = modWords.slice(0, targetWordCount).join(" ");
    }

    // Preprocess for comparison
    const processedOrig = preprocess(original);
    const processedMod = preprocess(modified);

    // Perform character-by-character diff
    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(processedOrig, processedMod);
    dmp.diff_cleanupSemantic(diffs);

    // Build HTML with proper character mapping
    let html = "";
    let origIndex = 0;
    let modIndex = 0;
    let equalCount = 0;

    for (let [op, data] of diffs) {
      if (op === DiffMatchPatch.DIFF_EQUAL) {
        const charsToAdd = original.substring(origIndex, origIndex + data.length);
        html += charsToAdd;

        // COUNT EXACT MATCHED LETTERS (correct)
        equalCount += charsToAdd.length;

        origIndex += data.length;
        modIndex += data.length;
      } else if (op === DiffMatchPatch.DIFF_DELETE) {
        // Character(s) deleted from original
        const deletedChars = original.substring(origIndex, origIndex + data.length);
        if (deletedChars.trim() !== "") {
          html += `<span style="background:#dc3545;color:white;text-decoration:line-through;padding:2px;border-radius:3px;">${deletedChars}</span>`;
        } else {
          html += deletedChars;
        }
        origIndex += data.length;
      } else if (op === DiffMatchPatch.DIFF_INSERT) {
        // Character(s) inserted in modified text
        const insertedChars = modified.substring(modIndex, modIndex + data.length);
        if (insertedChars.trim() !== "") {
          html += `<span style="background:#28a745;color:black;padding:2px;border-radius:3px;">${insertedChars}</span>`;
        } else {
          html += insertedChars;
        }
        modIndex += data.length;
      }
    }

    setDiffHtml(html);

    const totalLetters = original.length;
    const matchPercent = totalLetters > 0
      ? Math.round((equalCount / totalLetters) * 100)
      : 0;

    setMatchPercent(matchPercent);

    // Update stored text snapshots for next comparison
    lastOldTextRef.current = oldText;
    lastNewTextRef.current = newText;
  };

  // Hide results when typing
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
    setMemoriser(!memoriser);
    setBounceMemoriser(true);
    setTimeout(() => setBounceMemoriser(false), 300);
  };

  const handleAddToTray = () => {
    if (newText.trim() === "") return;

    // duplicate check
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
        paddingTop: "120px",
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
              backgroundColor: "white",
              border: "1px solid #555",
              borderRadius: "50%",
              width: "50px",
              height: "50px",
              padding: "0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "black",
              fontSize: "1.2rem",
              cursor: "pointer",
              animation: "zoomIn 0.2s forwards",
              transition: "background-color 0.2s, color 0.2s, border-color 0.2s, transform 0.2s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.backgroundColor = "black";
              e.currentTarget.style.color = "white";
              e.currentTarget.style.borderColor = "white";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.animation = "zoomOut 0.18s";
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.backgroundColor = "white";
              e.currentTarget.style.color = "black";
              e.currentTarget.style.borderColor = "#555";
              setTimeout(() => {
                if (e.currentTarget) e.currentTarget.style.animation = "";
              }, 180);
            }}
            onClick={e => {
              setZenMode(prev => !prev); // toggle Zen mode
              e.currentTarget.style.animation = "zoomOut 0.18s";
              e.currentTarget.style.transform = "scale(1)";
              setTimeout(() => {
                if (e.currentTarget) e.currentTarget.style.animation = "";
              }, 180);
            }}
          >
            Z
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
                backgroundColor: "white",
                border: "1px solid #555",
                borderRadius: "50%",
                width: "50px",
                height: "50px",
                padding: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "black",
                fontSize: "1.2rem",
                cursor: "pointer",
                animation: "zoomIn 0.2s forwards",
                transition: "background-color 0.2s, color 0.2s, border-color 0.2s, transform 0.2s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.backgroundColor = "black";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.borderColor = "white";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.animation = "zoomOut 0.18s";
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.backgroundColor = "white";
                e.currentTarget.style.color = "black";
                e.currentTarget.style.borderColor = "#555";
                setTimeout(() => {
                  if (e.currentTarget) e.currentTarget.style.animation = "";
                }, 180);
              }}
            >
              {showModified ? "H" : "S"}
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
                    borderRadius: "5px",            // stays the same
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
                    e.currentTarget.style.transform = "scale(1.05)"; // scales entire button
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
            handleDiff();
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

      {/* Bottom left corner - Version button */}
      {!zenMode && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            width: "120px",
            height: "80px",
          }}
          onMouseEnter={() => setHoverBottomLeft(true)}
          onMouseLeave={() => setHoverBottomLeft(false)}
        >
          {hoverBottomLeft && (
            <button
              style={{
                position: "absolute",
                bottom: "10px",
                left: "10px",
                backgroundColor: "white",
                border: "1px solid #555",
                borderRadius: "50%",
                width: "50px",
                height: "50px",
                padding: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "black",
                fontSize: "1.2rem",
                cursor: "pointer",
                animation: "zoomIn 0.2s forwards",
                whiteSpace: "nowrap",
                transition: "background-color 0.2s, color 0.2s, border-color 0.2s, transform 0.2s",
              }}
              onClick={e => {
                setShowHistory(true);
                e.currentTarget.style.animation = "zoomOut 0.18s";
                e.currentTarget.style.transform = "scale(1)";
                setTimeout(() => {
                  if (e.currentTarget) e.currentTarget.style.animation = "";
                }, 180);
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.backgroundColor = "black";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.borderColor = "white";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.animation = "zoomOut 0.18s";
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.backgroundColor = "white";
                e.currentTarget.style.color = "black";
                e.currentTarget.style.borderColor = "#555";
                setTimeout(() => {
                  if (e.currentTarget) e.currentTarget.style.animation = "";
                }, 180);
              }}
            >
              V
            </button>
          )}
        </div>
      )}

      {/* Bottom right corner - GitHub button */}
      {!zenMode && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            right: 0,
            width: "120px",
            height: "80px",
          }}
          onMouseEnter={() => setHoverBottomRight(true)}
          onMouseLeave={() => setHoverBottomRight(false)}
        >
          {hoverBottomRight && (
            <a
              href="https://github.com/seohakim158/textdiffchecker"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                position: "absolute",
                bottom: "10px",
                right: "10px",
                backgroundColor: "white",
                border: "1px solid #555",
                borderRadius: "50%",
                width: "50px",
                height: "50px",
                padding: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "black",
                fontSize: "1.2rem",
                textDecoration: "none",
                cursor: "pointer",
                animation: "zoomIn 0.2s forwards",
                transition: "background-color 0.2s, color 0.2s, border-color 0.2s, transform 0.2s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.backgroundColor = "black";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.borderColor = "white";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.animation = "zoomOut 0.18s";
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.backgroundColor = "white";
                e.currentTarget.style.color = "black";
                e.currentTarget.style.borderColor = "#555";
                setTimeout(() => {
                  if (e.currentTarget) e.currentTarget.style.animation = "";
                }, 180);
              }}
              onClick={e => {
                e.currentTarget.style.animation = "zoomOut 0.18s";
                e.currentTarget.style.transform = "scale(1)";
                setTimeout(() => {
                  if (e.currentTarget) e.currentTarget.style.animation = "";
                }, 180);
              }}
            >
              G
            </a>
          )}
        </div>
      )}

      {/* History popup */}
      {showHistory && (
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
            zIndex: 1000,
          }}
          onClick={() => setShowHistory(false)}
        >
          <div
            style={{
              backgroundColor: "#000",
              padding: "20px",
              borderRadius: "10px",
              minWidth: "300px",
              color: "white",
              border: "1px solid #333",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Version History</h3>
            <p>(No edits yet)</p>
            <button
              style={{
                marginTop: "15px",
                padding: "5px 10px",
                cursor: "pointer",
                borderRadius: "5px",
                border: "none",
                backgroundColor: "#1e90ff",
                color: "white",
                transition: "transform 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onClick={() => setShowHistory(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
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
          {matchPercent}% match
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
                  setTrayItems(prev => prev.filter(i => i.id !== deleteTargetItem.id));
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