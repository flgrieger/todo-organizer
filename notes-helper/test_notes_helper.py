#!/usr/bin/env python3
"""Unit tests for the pure parsing functions in notes_helper.

Run:  cd notes-helper && python3 -m unittest test_notes_helper
These cover only the pieces that don't touch Apple Notes, so they run anywhere.
"""

import unittest

from notes_helper import extract_todos, html_to_lines, FIELD_SEP, NOTE_SEP


def note(note_id, title, body):
    """Build one osascript-style note block."""
    return NOTE_SEP + note_id + FIELD_SEP + title + FIELD_SEP + body


class HtmlToLinesTests(unittest.TestCase):
    def test_div_and_br_split_into_separate_lines(self):
        html = "<div>First line</div><div>Second line</div>Third<br>Fourth"
        self.assertEqual(
            html_to_lines(html),
            ["First line", "Second line", "Third", "Fourth"],
        )

    def test_entities_decoded(self):
        self.assertEqual(html_to_lines("<div>Tom &amp; Jerry</div>"), ["Tom & Jerry"])

    def test_tags_stripped_and_empty_lines_dropped(self):
        html = "<div><b>Bold</b></div><div></div><div>Plain</div>"
        self.assertEqual(html_to_lines(html), ["Bold", "Plain"])

    def test_empty_body(self):
        self.assertEqual(html_to_lines(""), [])


class ExtractTodosTests(unittest.TestCase):
    def test_todo_line_extracted_and_prefix_stripped(self):
        raw = note("x-1", "Meeting", "<div>TODO: Book venue</div>")
        self.assertEqual(
            extract_todos(raw),
            [{"noteId": "x-1", "noteTitle": "Meeting", "text": "Book venue"}],
        )

    def test_lowercase_todo_matched(self):
        raw = note("x-1", "Meeting", "<div>todo: email sam</div>")
        self.assertEqual(extract_todos(raw)[0]["text"], "email sam")

    def test_non_todo_lines_ignored(self):
        raw = note("x-1", "Meeting",
                   "<div>Decision: launch in Q4</div><div>TODO: Ship it</div><div>random note</div>")
        got = extract_todos(raw)
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]["text"], "Ship it")

    def test_html_entities_in_todo_decoded(self):
        raw = note("x-1", "Meeting", "<div>TODO: Ping Tom &amp; Jerry</div>")
        self.assertEqual(extract_todos(raw)[0]["text"], "Ping Tom & Jerry")

    def test_multiple_notes_multiple_items(self):
        raw = (note("n-1", "First", "<div>TODO: A</div>")
               + note("n-2", "Second", "<div>TODO: B</div><div>TODO: C</div>"))
        got = extract_todos(raw)
        self.assertEqual(
            got,
            [
                {"noteId": "n-1", "noteTitle": "First", "text": "A"},
                {"noteId": "n-2", "noteTitle": "Second", "text": "B"},
                {"noteId": "n-2", "noteTitle": "Second", "text": "C"},
            ],
        )

    def test_empty_todo_line_dropped(self):
        raw = note("x-1", "Meeting", "<div>TODO:   </div><div>TODO: Real one</div>")
        got = extract_todos(raw)
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]["text"], "Real one")

    def test_prefix_only_within_line_start(self):
        # "TODO:" appearing mid-line should NOT match.
        raw = note("x-1", "Meeting", "<div>Reminder that TODO: is our convention</div>")
        self.assertEqual(extract_todos(raw), [])

    def test_empty_raw(self):
        self.assertEqual(extract_todos(""), [])


if __name__ == "__main__":
    unittest.main()
