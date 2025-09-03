import express from "express";
import app from "../server/server.js";

const handler = express();
handler.use("/api", app);

export default handler;
