# Contributing

This is the source of the NovAtom Labs marketing site, maintained by the NovAtom Labs team. Changes from the team go through a branch and a pull request.

## Workflow

1. Create a branch from `main`: `git switch -c <short-description>`.
2. Make the change. Use `npm run dev` while working.
3. Before opening a pull request:
   - `npm run build` completes without errors.
   - If you touched layout, scroll or motion, run `npm run preview` and click through the affected pages. For scroll dots, click each one and check that the section's content is on screen.
   - `npm run test:e2e` passes, or you can say which failures were already there (see the note in [docs/TESTING.md](docs/TESTING.md)).
4. Open a pull request that says what changed and why, and include a screenshot or short recording for visual changes.

## Rules for this codebase

- **Same design for everyone.** Do not branch the layout or content by device quality or by the OS motion setting. Performance work should lower cost (point counts, frame rate), not remove features.
- **Keep it light.** The page has to stay smooth on an ordinary laptop and a mid-range phone. Check frame pacing (`tests/diagnostics/jank.mjs`) when you add anything that animates or paints large areas.
- **No secrets in the repo.** The form endpoint is public by design. Do not commit API keys, tokens or `.env` files; the `.gitignore` already excludes `.env*`.
- **Copy needs a source.** Do not add statistics, partner names, people or claims that the team has not confirmed. See the writing notes in [docs/CONTENT-GUIDE.md](docs/CONTENT-GUIDE.md).
- **Do not commit build output or test captures.** `.next/`, `node_modules/` and `tests/shots/` are ignored.

## Commit messages

A short imperative summary line, then a blank line and the reason if it is not obvious. For example: `Land the Team scroll dot below the heading`.

## Reporting a problem

Open an issue with the page, the browser and operating system, what you expected and what happened. For a visual or performance problem, add `?debug` to the URL and include the badge text.
