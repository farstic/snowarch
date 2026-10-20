@echo off
rem The Windows launcher. Node absent is exit 3 — the code the engine reserves for "a prerequisite
rem is missing", and the one `tests/launcher-parity.test.mjs` and the CI cell assert.
rem
rem `goto`, not `(echo … ^& exit /b 3)`. That form looked right and never worked: inside a
rem parenthesised block the `^&` is ESCAPED, so it was part of the echoed TEXT rather than a command
rem separator — the message printed "… --mode design & exit /b 3" and execution fell straight
rem through to `node`, which is not there, and the step ended with cmd's 9009 instead of 3. The
rem check that would have caught it was dead code: the CI step invoked this file without `call`, so
rem cmd transferred control and the assertions on the following lines never ran (ARC-08-S11's
rem finding, ARC-09-S04's fix).
rem
rem ONE LINE for node and the exit (ARC-09-C194). cmd reads a batch file a line at a time, by byte offset, and goes
rem back to the file after each command; an `upgrade` replaces this file while node runs, so a second line would be
rem read from the NEW file at the OLD offset: a release that grew the file made the two-line form run the CLI 4,661
rem times. The exit is `call exit /b %%ERRORLEVEL%%`, measured on the Windows cells as the one form that hands back
rem node's code under `cmd /c` (`exit /b` and `goto :eof` gave 0, and `%ERRORLEVEL%` expands before node runs).
where node >nul 2>nul || goto :no_node
node "%~dp0tools\snowarch\bin\snowarch.mjs" %* & call exit /b %%ERRORLEVEL%%

:no_node
echo snowarch: Node.js 20+ is required for this command. Design-only works without it: .\bootstrap.cmd --mode design
exit /b 3
