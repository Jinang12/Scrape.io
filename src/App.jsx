import "./App.css";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import CanvasEditor from "./pages/CanvasEditor.jsx";

function App() {
  return (
    <BrowserRouter>
      <div
        style={{
          padding: 16,
          borderBottom: "1px solid #eee",
          marginBottom: 16,
        }}
      >
        <Link to="/" style={{ textDecoration: "none", fontWeight: 800, fontSize:"2.5rem"}}>
          Scrape.io
        </Link>
      </div>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/canvas/:canvasId" element={<CanvasEditor />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
