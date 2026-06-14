import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PlayerApp from "./PlayerApp";
import UpdateBanner from "./UpdateBanner";
import "../../src/styles.css";
import "./player.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlayerApp />
    <UpdateBanner />
  </StrictMode>,
);
