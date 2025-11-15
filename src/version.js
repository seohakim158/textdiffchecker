import React from "react";

export default function VersionHistory({ onClose }) {
  return (
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
      onClick={onClose}
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

        <p>
          <strong>Version 1.0.0</strong>
          <br />
          Initial release
        </p>

        <p style={{ marginTop: "15px" }}>
          <strong>Version 1.0.1</strong>
          <br />
          Added proper algorithm
        </p>

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
          onMouseEnter={(e) =>
            (e.currentTarget.style.transform = "scale(1.05)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
