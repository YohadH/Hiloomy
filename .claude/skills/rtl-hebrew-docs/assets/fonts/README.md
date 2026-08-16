# Bundled fonts (optional)

Drop OFL-licensed Hebrew TTF files here if you want the skill to embed a
specific brand font instead of relying on system fonts.

**Safe to bundle (SIL Open Font License):** Rubik, Heebo, Assistant,
Frank Ruhl Libre, David Libre, Noto Sans/Serif Hebrew, download from
[Google Fonts](https://fonts.google.com).

**Do NOT bundle** system fonts (David, Narkisim, Arial Hebrew), they are not
redistributable. Rely on them only when the target machine already has them.

You usually don't need anything here: headless Chrome on macOS/Windows already
ships Hebrew fonts, and on Linux a one-time `sudo apt-get install fonts-noto-hebrew`
covers it. See `../../references/hebrew-fonts.md`.
