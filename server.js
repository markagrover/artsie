/**
 * Cursor Publish / Vercel Express entry.
 * Imports express so the host detects an Express backend (not static-only).
 * Requires `npm run build` first so apps/api/dist exists.
 * Keep this sync (no top-level await) — publish hosts expect a sync default export.
 */
import express from "express";
import { createApp } from "./apps/api/dist/app.js";

void express;

export default createApp();
