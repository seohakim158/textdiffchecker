import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import DiffMatchPatch from "diff-match-patch";

// --- Debounce helper ---
function debounce(fn, ms) {
  let timer;
  function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }
  debounced.cancel = () => timer && clearTimeout(timer);
  return debounced;
}

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

  // --- Helper functions ---
  const preprocess = useCallback((text) => {
    let result = text;
    if (ignoreCase) result = result.toLowerCase();
    if (ignorePunctuation) result = result.replace(/[.,!/#$%^&*;:{}=\-_`~()"]/g, "");
    return result;
  }, [ignoreCase, ignorePunctuation]);

  // Merge consecutive diffs efficiently (block-level, not per char)
  function mergeDiffs(diffs, original, modified) {
    let html = "";
    let oIdx = 0;
    let mIdx = 0;
    let i = 0;
    while (i < diffs.length) {
      const [op, data] = diffs[i];
      if (op === DiffMatchPatch.DIFF_EQUAL) {
        let len = data.length;
        html += original.substring(oIdx, oIdx + len);
        oIdx += len;
        mIdx += len;
        i++;
      } else if (op === DiffMatchPatch.DIFF_DELETE) {
        let delLen = data.length;
        let j = i + 1;
        while (j < diffs.length && diffs[j][0] === DiffMatchPatch.DIFF_DELETE) {
          delLen += diffs[j][1].length;
          j++;
        }
        const s = original.substring(oIdx, oIdx + delLen);
        html += (s.trim() !== "")
          ? `<span style="background:#dc3545;color:white;text-decoration:line-through;padding:2px;border-radius:3px;">${s}</span>`
          : s;
        oIdx += delLen;
        i = j;
      } else if (op === DiffMatchPatch.DIFF_INSERT) {
        let insLen = data.length;
        let j = i + 1;
        while (j < diffs.length && diffs[j][0] === DiffMatchPatch.DIFF_INSERT) {
          insLen += diffs[j][1].length;
          j++;
        }
        const s = modified.substring(mIdx, mIdx + insLen);
        html += (s.trim() !== "")
          ? `<span style="background:#28a745;color:black;padding:2px;border-radius:3px;">${s}</span>`
          : s;
        mIdx += insLen;
        i = j;
      }
    }
    return html;
  }

  // Efficiently count correct/non-highlighted letters (no DOM nodes)
  function calculateCorrectLetters(html) {
    let correctLetters = 0;
    let totalLetters = 0;
    let inSpan = false;
    let i = 0;
    while (i < html.length) {
      if (!inSpan && html[i] === "<" && html.startsWith("<span", i)) {
        inSpan = true;
        // skip to '>'
        let close = html.indexOf(">", i);
        i = close >= 0 ? close + 1 : i + 1;
        continue;
      }
      if (inSpan && html[i] === "<" && html.startsWith("</span>", i)) {
        inSpan = false;
        i += 7;
        continue;
      }
      // Only count visible text, skip tags
      if (!inSpan && html[i] !== "<") {
        if (!/\s/.test(html[i])) correctLetters++;
      }
      if (html[i] !== "<" && html[i] !== ">") {
        if (!/\s/.test(html[i])) totalLetters++;
      }
      i++;
    }
    // For total, also count letters inside spans
    // So we need to count all non-whitespace letters that are not tags
    // But above, totalLetters only counts outside of tags, so adjust:
    // Instead, get text content (strip tags), then count non-whitespace
    let textOnly = html.replace(/<[^>]+>/g, "");
    totalLetters = (textOnly.match(/\S/g) || []).length;
    return {
      correctLetters,
      totalLetters,
      matchPercent: totalLetters > 0 ? (correctLetters / totalLetters) * 100 : 0
    };
  }

  // --- Main diff handler ---
  // Memoize char-to-word maps for original and modified text
  const origWordInfo = useMemo(() => buildCharToWordMap(oldText), [oldText]);
  const modWordInfo = useMemo(() => buildCharToWordMap(newText), [newText]);

  // Memoized buildCharToWordMap
  function buildCharToWordMap(text) {
    const words = [];
    const charToWord = [];
    let wordStart = null;
    let curWordIdx = -1;
    for (let i = 0; i < text.length; ++i) {
      const ch = text[i];
      if (/\s/.test(ch)) {
        if (wordStart !== null) {
          words.push({ start: wordStart, end: i });
          curWordIdx++;
          wordStart = null;
        }
        charToWord.push(curWordIdx + 1);
      } else {
        if (wordStart === null) wordStart = i;
        charToWord.push(curWordIdx + 1);
      }
    }
    if (wordStart !== null) {
      words.push({ start: wordStart, end: text.length });
    }
    return { words, charToWord };
  }

  // --- Main diff handler (debounced, throttled) ---
  const handleDiffCore = useCallback(() => {
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
    // --- Memoriser mode logic: only compare up to the number of words in the modified text.
    if (memoriser) {
      const origWords = original.split(/\s+/).filter(w => w.trim() !== "");
      const modWords = modified.split(/\s+/).filter(w => w.trim() !== "");
      const targetWordCount = modWords.length;
      original = origWords.slice(0, targetWordCount).join(" ");
      modified = modWords.slice(0, targetWordCount).join(" ");
    }
    // Create processed strings and index maps only when ignore options are enabled.
    const procOrig = preprocess(original);
    const procMod = preprocess(modified);

    // Build mapping from processed-string indices back to original indices so we can map diffs
    // to positions in the real original/modified strings (preserving display text).
    function buildIndexMap(fromText, processedText) {
      const map = [];
      let p = 0;
      for (let i = 0; i < fromText.length && p < processedText.length; ++i) {
        const ch = fromText[i];
        const transformed = (() => {
          let t = ch;
          if (ignoreCase) t = t.toLowerCase();
          if (ignorePunctuation) t = t.replace(/[.,!/#$%^&*;:{}=\-_`~()\"]/g, "");
          return t;
        })();
        if (transformed === "") continue; // removed by preprocess
        // transformed might be multiple chars removed by punctuation removal; compare char by char
        for (let k = 0; k < transformed.length && p < processedText.length; ++k) {
          // map processed index p back to original index i
          map[p] = i;
          p++;
        }
      }
      return map;
    }

    // If neither option is enabled, do a direct diff on original strings (fast, simple).
    let diffs;
    let procOrigToOrigMap = null;
    let procModToModMap = null;
    const dmp = new DiffMatchPatch();
    if (!ignoreCase && !ignorePunctuation) {
      // Use raw strings for diffs so indices match original text exactly
      diffs = dmp.diff_main(original, modified);
    } else {
      // Use processed strings for comparison, but keep maps to original/modified indices
      procOrigToOrigMap = buildIndexMap(original, procOrig);
      procModToModMap = buildIndexMap(modified, procMod);
      diffs = dmp.diff_main(procOrig, procMod);
    }
    dmp.diff_cleanupSemantic(diffs);

    const wordInfo = buildCharToWordMap(original);

    // Collect changed char ranges mapped to original text positions
    let origIdx = 0; // index within the string used for diffs (either original or processed)
    let modIdx = 0;  // same for modified/processed
    const changedCharPositions = [];
    for (let [op, data] of diffs) {
      if (op === DiffMatchPatch.DIFF_EQUAL) {
        origIdx += data.length;
        modIdx += data.length;
      } else if (op === DiffMatchPatch.DIFF_DELETE) {
        if (data.length > 0) {
          if (!ignoreCase && !ignorePunctuation) {
            // diffs were computed on raw original -> indices map directly
            changedCharPositions.push([origIdx, origIdx + data.length - 1]);
          } else {
            // diffs were computed on processed strings -> map processed indices back to original
            const startProc = origIdx;
            const endProc = origIdx + data.length - 1;
            const startOrig = (procOrigToOrigMap && procOrigToOrigMap[startProc] !== undefined) ? procOrigToOrigMap[startProc] : null;
            const endOrig = (procOrigToOrigMap && procOrigToOrigMap[endProc] !== undefined) ? procOrigToOrigMap[endProc] : null;
            if (startOrig !== null && endOrig !== null) {
              changedCharPositions.push([startOrig, endOrig]);
            } else if (startOrig !== null) {
              changedCharPositions.push([startOrig, startOrig]);
            }
          }
        }
        origIdx += data.length;
      } else if (op === DiffMatchPatch.DIFF_INSERT) {
        if (!ignoreCase && !ignorePunctuation) {
          // insertion length applies to modified; mark a zero-width insertion at current origIdx
          changedCharPositions.push([origIdx, origIdx]);
        } else {
          // For processed diffs, we map an insertion in processed modified back to a position in original modified
          const startProc = modIdx;
          const mappedIdx = (procModToModMap && procModToModMap[startProc] !== undefined) ? procModToModMap[startProc] : null;
          if (mappedIdx !== null) changedCharPositions.push([mappedIdx, mappedIdx]);
        }
        modIdx += data.length;
      }
    }

    // Build fullHtml with merged highlights
    const fullHtml = mergeDiffs(diffs, original, modified);

    // Only update state if values changed
    function updateDiffState(html) {
      const { correctLetters: cl, totalLetters: tl, matchPercent: mp } = calculateCorrectLetters(html);
      if (diffHtml !== html) setDiffHtml(html);
      if (correctLetters !== cl) setCorrectLetters(cl);
      if (totalLetters !== tl) setTotalLetters(tl);
      if (matchPercent !== mp) setMatchPercent(mp);
    }

    // If no changes, just show the fullHtml
    if (changedCharPositions.length === 0) {
      updateDiffState(fullHtml);
      lastOldTextRef.current = oldText;
      lastNewTextRef.current = newText;
      return;
    }

    // Build trimmedHtml for memoriser mode (chunked, char-level highlighting)
    let trimmedHtml = "";
    if (memoriser) {
      // Per-word comparison up to the number of words in modified text.
      const wordCount = wordInfo.words.length;
      const origWords = wordInfo.words.map(w => original.slice(w.start, w.end));
      const modWords = modified.split(/\s+/).filter(w => w.length > 0);
      const compareLength = Math.min(modWords.length, wordCount);

      // Find changed word indices (compare using preprocess() when options enabled)
      // Improved: handle insertions at the start correctly (e.g. "nice to meet you" vs "hello nice to meet you")
      const changedIndices = [];
      let insertedAtStartCount = 0;
      // Find the offset where the original and modified first match
      let origIdx = 0, modIdx = 0;
      while (
        origIdx < origWords.length &&
        modIdx < modWords.length &&
        preprocess(origWords[origIdx]) === preprocess(modWords[modIdx])
      ) {
        origIdx++;
        modIdx++;
      }
      // If modIdx > 0, then there are insertions at the start
      if (modIdx > 0 && origIdx === 0) {
        // All words before the first match are insertions
        for (let i = 0; i < modIdx; ++i) changedIndices.push(i);
        insertedAtStartCount = modIdx;
      }
      // Now, continue per-word comparison after the insertion(s) at start
      for (let i = modIdx; i < compareLength; ++i) {
        const origW = origWords[i - insertedAtStartCount] ?? "";
        const modW = modWords[i] ?? "";
        const procOrig = preprocess(origW);
        const procMod = preprocess(modW);
        if (procOrig !== procMod) changedIndices.push(i);
      }

      // Build trimmedHtml for memoriser mode regardless of changedIndices
      // Merge changed indices into chunks of [start..end] with 3-word context each
      const chunks = [];
      for (const idx of changedIndices) {
        const from = Math.max(0, idx - 3);
        const to = Math.min(wordCount - 1, idx + 3);
        if (chunks.length === 0) {
          chunks.push([from, to]);
        } else {
          const last = chunks[chunks.length - 1];
          if (from <= last[1] + 1) {
            last[1] = Math.max(last[1], to);
          } else {
            chunks.push([from, to]);
          }
        }
      }

      function escapeHtml(s) {
        return (s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function renderWordWithCharDiff(origW, modW) {
        if (origW === undefined) origW = "";
        if (modW === undefined) modW = "";
        if (origW === modW) return escapeHtml(origW);
        const localDmp = new DiffMatchPatch();
        const wdiffs = localDmp.diff_main(origW, modW);
        localDmp.diff_cleanupSemantic(wdiffs);
        let out = "";
        for (const [op, data] of wdiffs) {
          if (op === DiffMatchPatch.DIFF_EQUAL) {
            out += escapeHtml(data);
          } else if (op === DiffMatchPatch.DIFF_DELETE) {
            out += `<span style="background:#dc3545;color:white;text-decoration:line-through;padding:2px;border-radius:3px;">${escapeHtml(data)}</span>`;
          } else if (op === DiffMatchPatch.DIFF_INSERT) {
            out += `<span style="background:#28a745;color:black;padding:2px;border-radius:3px;">${escapeHtml(data)}</span>`;
          }
        }
        return out;
      }

      // Build each chunk as concatenation of original text words but replace changed words with inline diffs.
      const chunkHtmlParts = [];
      for (let c = 0; c < chunks.length; ++c) {
        const [startIdx, endIdx] = chunks[c];
        let piece = "";
        for (let wi = startIdx; wi <= endIdx; ++wi) {
          // For words that were inserted at the start, there is no original word: display as insertion
          let origToken, modToken;
          if (wi < insertedAtStartCount) {
            origToken = "";
            modToken = modWords[wi] ?? "";
          } else {
            const span = wordInfo.words[wi - insertedAtStartCount];
            origToken = span ? original.slice(span.start, span.end) : "";
            modToken = (wi < modWords.length) ? modWords[wi] : "";
          }
          // Determine if this word was changed (using preprocess comparison)
          let changed = changedIndices.includes(wi);
          if (changed) {
            piece += renderWordWithCharDiff(origToken, modToken || "");
          } else {
            piece += escapeHtml(origToken);
          }
          // Preserve the following whitespace character from the original (if any)
          if (wi >= insertedAtStartCount && wordInfo.words[wi - insertedAtStartCount]) {
            const span = wordInfo.words[wi - insertedAtStartCount];
            if (span.end < original.length && /\s/.test(original[span.end])) {
              piece += original[span.end];
            } else {
              if (wi !== endIdx) piece += " ";
            }
          } else {
            // For inserted-at-start words, just add a space if not last in chunk
            if (wi !== endIdx) piece += " ";
          }
        }
        chunkHtmlParts.push(piece);
      }
      trimmedHtml = chunkHtmlParts.map(p => p).join('<br/>...<br/>');

      // Memoriser mode: choose display based on which has higher matchPercent
      if (memoriser) {
        // Build trimmedHtml for memoriser highlighting
        const trimmedHtmlParts = chunkHtmlParts.map(p => p).join('<br/>...<br/>');

        // Calculate match stats for both trimmedHtml and fullHtml
        const memStats = calculateCorrectLetters(trimmedHtmlParts);
        const nonMemStats = calculateCorrectLetters(fullHtml);

        // Decide which display to use based on higher matchPercent
        if (nonMemStats.matchPercent > memStats.matchPercent) {
          // Use fullHtml display if its matchPercent is higher
          updateDiffState(fullHtml);
        } else {
          // Otherwise use memoriser trimmedHtml
          if (diffHtml !== trimmedHtmlParts) setDiffHtml(trimmedHtmlParts);
          if (correctLetters !== memStats.correctLetters) setCorrectLetters(memStats.correctLetters);
          if (totalLetters !== memStats.totalLetters) setTotalLetters(memStats.totalLetters);
          if (matchPercent !== memStats.matchPercent) setMatchPercent(memStats.matchPercent);
        }

        lastOldTextRef.current = oldText;
        lastNewTextRef.current = newText;
        return;
      } else {
        updateDiffState(fullHtml);
      }
    } else {
      // In non-memoriser mode, virtually append a space after each original word for diffing purposes,
      // if the word does not have a space immediately after it.
      // This ensures end-of-word differences are detected, and now the display also shows these spaces.
      let origForDiff = original;
      let virtualSpacePositions = new Set(); // indices in origForDiff where a virtual space was added
      if (original.length > 0) {
        // Find word boundaries
        const wordSpans = buildCharToWordMap(original).words;
        let lastIdx = 0;
        let pieces = [];
        let runningLength = 0;
        for (let i = 0; i < wordSpans.length; ++i) {
          const span = wordSpans[i];
          // Push text before this word (should be whitespace or nothing)
          if (lastIdx < span.start) {
            pieces.push(original.slice(lastIdx, span.start));
            runningLength += span.start - lastIdx;
          }
          let word = original.slice(span.start, span.end);
          let addVirtualSpace = false;
          // If next char is not whitespace (or at end), add a virtual space (for diffing and display)
          if (
            span.end === original.length ||
            (span.end < original.length && !/\s/.test(original[span.end]))
          ) {
            addVirtualSpace = true;
          }
          pieces.push(word);
          runningLength += word.length;
          if (addVirtualSpace) {
            pieces.push(" ");
            virtualSpacePositions.add(runningLength); // position in origForDiff where the virtual space is
            runningLength += 1;
          }
          lastIdx = span.end;
        }
        // Add any trailing text
        if (lastIdx < original.length) {
          pieces.push(original.slice(lastIdx));
        }
        origForDiff = pieces.join("");
      } else {
        origForDiff = original;
      }
      // Use the (possibly virtually spaced) original for diffing, and display the same (including virtual spaces).
      let diffsForDisplay;
      if (!ignoreCase && !ignorePunctuation) {
        // Use raw strings for diffs so indices match original text exactly
        const dmp2 = new DiffMatchPatch();
        diffsForDisplay = dmp2.diff_main(origForDiff, modified);
        dmp2.diff_cleanupSemantic(diffsForDisplay);
        // When building HTML, use the virtually spaced original text, and display virtual spaces as normal spaces.
        let html = "";
        let oIdx = 0; // index in origForDiff
        let mIdx = 0; // index in modified
        let i = 0;
        while (i < diffsForDisplay.length) {
          const [op, data] = diffsForDisplay[i];
          if (op === DiffMatchPatch.DIFF_EQUAL) {
            // For equal, show original text (including virtual spaces)
            let len = data.length;
            html += origForDiff.slice(oIdx, oIdx + len);
            oIdx += len;
            mIdx += len;
            i++;
          } else if (op === DiffMatchPatch.DIFF_DELETE) {
            let delLen = data.length;
            let j = i + 1;
            while (j < diffsForDisplay.length && diffsForDisplay[j][0] === DiffMatchPatch.DIFF_DELETE) {
              delLen += diffsForDisplay[j][1].length;
              j++;
            }
            // For deletion, display all deleted chars (including virtual spaces), and highlight them
            let sDisplay = origForDiff.slice(oIdx, oIdx + delLen);
            html += (sDisplay.trim() !== "")
              ? `<span style="background:#dc3545;color:white;text-decoration:line-through;padding:2px;border-radius:3px;">${sDisplay}</span>`
              : sDisplay;
            oIdx += delLen;
            i = j;
          } else if (op === DiffMatchPatch.DIFF_INSERT) {
            let insLen = data.length;
            let j = i + 1;
            while (j < diffsForDisplay.length && diffsForDisplay[j][0] === DiffMatchPatch.DIFF_INSERT) {
              insLen += diffsForDisplay[j][1].length;
              j++;
            }
            const s = modified.substring(mIdx, mIdx + insLen);
            html += (s.trim() !== "")
              ? `<span style="background:#28a745;color:black;padding:2px;border-radius:3px;">${s}</span>`
              : s;
            mIdx += insLen;
            i = j;
          }
        }
        updateDiffState(html);
      } else {
        // Use processed strings for comparison, but keep maps to original/modified indices
        procOrigToOrigMap = buildIndexMap(origForDiff, preprocess(origForDiff));
        procModToModMap = buildIndexMap(modified, procMod);
        const dmp2 = new DiffMatchPatch();
        diffsForDisplay = dmp2.diff_main(preprocess(origForDiff), procMod);
        dmp2.diff_cleanupSemantic(diffsForDisplay);
        // Build changedCharPositions and HTML as above, but map indices back to virtually spaced original
        let origIdx2 = 0; // index in preprocessed origForDiff
        let modIdx2 = 0; // index in preprocessed modified
        let html = "";
        for (let i = 0; i < diffsForDisplay.length; ++i) {
          const [op, data] = diffsForDisplay[i];
          if (op === DiffMatchPatch.DIFF_EQUAL) {
            // Map processed index to virtually spaced original index
            for (let k = 0; k < data.length; ++k) {
              const origPos = procOrigToOrigMap[origIdx2 + k];
              if (origPos !== undefined && origPos < origForDiff.length) {
                html += origForDiff[origPos];
              }
            }
            origIdx2 += data.length;
            modIdx2 += data.length;
          } else if (op === DiffMatchPatch.DIFF_DELETE) {
            // For delete, build span, using virtually spaced original
            let sDisplay = "";
            for (let k = 0; k < data.length; ++k) {
              const origPos = procOrigToOrigMap[origIdx2 + k];
              if (origPos !== undefined && origPos < origForDiff.length) {
                sDisplay += origForDiff[origPos];
              }
            }
            html += (sDisplay.trim() !== "")
              ? `<span style="background:#dc3545;color:white;text-decoration:line-through;padding:2px;border-radius:3px;">${sDisplay}</span>`
              : sDisplay;
            origIdx2 += data.length;
          } else if (op === DiffMatchPatch.DIFF_INSERT) {
            // For insert, use modified string
            let s = "";
            for (let k = 0; k < data.length; ++k) {
              const modPos = procModToModMap[modIdx2 + k];
              if (modPos !== undefined && modPos < modified.length) {
                s += modified[modPos];
              }
            }
            html += (s.trim() !== "")
              ? `<span style="background:#28a745;color:black;padding:2px;border-radius:3px;">${s}</span>`
              : s;
            modIdx2 += data.length;
          }
        }
        updateDiffState(html);
      }
    }

    lastOldTextRef.current = oldText;
    lastNewTextRef.current = newText;
  // eslint-disable-next-line
  }, [resultsShown, oldText, newText, memoriser, preprocess, diffHtml, correctLetters, totalLetters, matchPercent]);

  // Debounced handleDiff for large input performance
  const debouncedHandleDiff = useMemo(
    () => debounce(() => handleDiffCore(), 200),
    [handleDiffCore]
  );

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
  }, [resultsShown, oldText, newText, debouncedHandleDiff, setResultsShown]);

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
            setShowHistory(true);
            e.currentTarget.style.animation = "zoomOut 0.18s";
            e.currentTarget.style.transform = "scale(1)";
            setTimeout(() => {
              if (e.currentTarget) e.currentTarget.style.animation = "";
            }, 180);
          }}
        >
          V
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
            // No onClick, just link
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