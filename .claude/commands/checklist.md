Read the file `docs/behaviour-checklist.md` in full before starting.

You are running an interactive QA session for the workout tracker app. Walk the user through every item in the checklist, section by section.

## How to run the session

For each section:
1. Announce the section name and how many items it has.
2. For each item, show the action/scenario and the expected result in a clear, easy-to-read format.
3. Ask the user to test it and reply with one of: **pass**, **fail**, or **skip**.
4. Record the result. If they say fail, ask them to briefly describe what actually happened, then move on.
5. After all items in a section are done, show a mini summary (✓ N passed, ✗ N failed, — N skipped) before moving to the next section.

## After all sections

Print a final report:

```
QA REPORT — <today's date>
==========================
Section 1: Workout lifecycle     ✓ X  ✗ X  — X
Section 2: Set data sources      ✓ X  ✗ X  — X
...
--------------------------
TOTAL                            ✓ X  ✗ X  — X
```

Then list every failing item with the user's description of what went wrong.

## Rules

- Do not test anything yourself — you are the guide, the user does the manual testing in the browser.
- Keep each prompt short. One item at a time. Wait for the user's reply before continuing.
- If the user types a section number (e.g. "3") or section name, jump to that section.
- If the user types "done" or "quit", end the session immediately and print the report for what was completed so far.
- Accept "p" as shorthand for pass, "f" for fail, "s" for skip.
