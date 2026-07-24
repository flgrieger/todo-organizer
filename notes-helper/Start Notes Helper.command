#!/bin/bash
# Double-click this file in Finder to start the Notes → Todo Helper.
# It starts the helper and opens a control panel in your web browser.
# Nothing to install — it uses the Python that comes with macOS.
# Leave the Terminal window it opens running; close it (or click "Stop helper"
# in the browser) when you're done.
cd "$(dirname "$0")" || exit 1
exec python3 notes_helper.py
