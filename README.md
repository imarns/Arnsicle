
# Arnsicle — Fact-Checked Articles with TTS (100% static)

A free, client-side web app you can host on GitHub Pages. It fetches reliable open sources (Wikipedia + Crossref), composes an **extractive, cited** explainer, and reads it aloud via the Web Speech API.

- No API keys. No server. Works on phone and desktop. Installable PWA.
- Fact-first: shows a Sources list; body sentences include bracketed citations [1], [2], …
- Optional: enable Crossref to list recent papers (last N years).

## Quick deploy (GitHub Pages)
1. Upload all files in this folder to a **public** repo.
2. Settings → Pages → Source: **Deploy from a branch**, Branch: `main` (root). Save.
3. Open: `https://<username>.github.io/<repo>/`
4. iOS Safari → Share → Add to Home Screen. Android Chrome → Install.

## Why no paid GPT API?
This build is **keyless** so it can run anywhere for free. Generation is extractive from cited sources to avoid hallucinations. If you want full LLM writing, add a provider later (OpenAI, etc.).

## Dev notes
- Sources:
  - Wikipedia Search + Extracts (CORS-friendly)
  - Crossref Works API (CORS-friendly) for journal items
- Offline:
  - Static assets cached by service worker. Data saved in localStorage.
- TTS:
  - Uses `speechSynthesis` and picks an available female voice when possible.
