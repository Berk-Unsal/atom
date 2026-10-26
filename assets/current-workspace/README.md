# Matched current workspace previews

`light.png` and `dark.png` are unedited 1440 × 900 Chromium captures of the same two-Cell Ankara baseline and real Go API execution. `capture.json` records the source commit, application/model identity, dataset hashes, imported public fixture and RF request, returned metrics, tile coordinates, selected markers and image hashes. The map uses the corresponding Alidade Smooth style in each theme; drawing colors can differ while inputs, results and map position stay fixed.

The source commit identifies the production app used for the captures. This documentation-only follow-up adds the capture workflow and assets on top of that commit. The images illustrate planning estimates; they are not field measurements or proof of physical accuracy.

Reproduce with the command recorded in `capture.json`, after installing the documented frontend dependencies, Chromium, Go toolchain and Git LFS dataset. The explicit capture flag and separate Playwright config start a real backend and overwrite only this pair and its manifest; normal CI verifies the committed assets without regenerating them. Map tiles must load successfully. Existing historical galleries remain unchanged.
