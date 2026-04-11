import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import React, {useEffect, useState} from "react";
import "leaflet/dist/leaflet.css";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Friends from "./pages/Friends";
import Profile from "./pages/Profile";
import "./style.css";

function App() {
  return (
    <Router>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
      <Footer />
    </Router>
  );
}

export default App;
