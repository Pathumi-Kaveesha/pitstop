# Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
#
# WSO2 LLC. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

"""Writing a message from search results: the text clean-up helpers, the prompt, and how Claude's replies and failures are
handled. Claude itself is replaced by a fake, so these tests make no real calls."""

import types

import anthropic
import httpx
import pytest

import answering.compose as compose

EXCERPTS = [("Choreo guide", "Page 2", "Choreo ships APIs."), ("Pricing sheet", "Sheet 1", "Plans start small.")]


# ---- clean-up helpers


@pytest.mark.parametrize(
    "written, cleaned",
    [
        ("See https://example.com/page for details.", "See for details."),
        ("Read the guide (https://example.com/guide).", "Read the guide."),
        ("Open www.example.com/docs, then reply.", "Open, then reply."),
        ("Two links: http://a.example/x and https://b.example/y!", "Two links: and!"),
        ("No links here.", "No links here."),
        ("Mixed CASE HTTPS://EXAMPLE.COM/X link", "Mixed CASE link"),
        ("Line one  \n  Line two   ", "Line one\n Line two"),
    ],
)
def test_web_addresses_are_removed_with_the_gaps_they_leave(written, cleaned):
    assert compose.strip_links(written) == cleaned


def test_a_cut_off_text_ends_at_its_last_whole_sentence():
    assert compose._finish_at_sentence("One sentence here. Two sentences here. And then it stops mid") == (
        "One sentence here. Two sentences here."
    )


def test_a_text_that_already_ends_a_sentence_is_left_alone():
    for text in ("Done.", "Really!", "Why?"):
        assert compose._finish_at_sentence(text) == text


def test_a_text_with_no_sentence_end_in_its_second_half_is_left_alone():
    text = "A long first sentence that ends early. and then a very long tail with no ending of any kind at all really"
    assert compose._finish_at_sentence(text) == text


def test_the_subject_line_is_split_off_an_email():
    assert compose.split_subject('Subject: "Your Choreo guide"\n\nHello there.') == (
        "Your Choreo guide",
        "Hello there.",
    )
    assert compose.split_subject("subject:   Many   spaces \nBody") == ("Many spaces", "Body")


@pytest.mark.parametrize(
    "text",
    [
        "No subject line here.\nJust a body.",
        "Subject:\nBody only",
        "Subject: " + "x" * 200 + "\nBody",
        "Subject: Only a subject",
    ],
)
def test_an_email_without_a_usable_subject_keeps_its_whole_text_as_the_body(text):
    subject, body = compose.split_subject(text)
    assert subject is None
    assert body


def test_a_greeting_and_a_sign_off_the_model_added_are_taken_off_an_email():
    written = "Hi Sam,\nHere are the materials.\nLet me know if you have questions.\nBest regards,\nAlex"
    assert compose.strip_frame(written) == "Here are the materials.\nLet me know if you have questions."


@pytest.mark.parametrize(
    "written",
    [
        "Hello world is a classic program.\nIt prints a line.",
        "Here are the materials.\nLet me know.",
        "Thanks for the time we spent together on this long project last year.\nMore text.",
    ],
)
def test_text_that_only_looks_a_little_like_a_greeting_or_sign_off_is_left_alone(written):
    assert compose.strip_frame(written) == written


def test_a_long_closing_is_not_mistaken_for_a_sign_off():
    written = "Body line.\nBest regards,\n" + "A very long line that is clearly part of the message itself, not a name."
    assert compose.strip_frame(written) == written


def test_an_email_that_is_only_a_greeting_and_a_sign_off_is_not_emptied():
    assert compose.strip_frame("Hi there,\nThanks") == "Hi there,\nThanks"


# ---- the prompt


def test_the_prompt_wraps_every_excerpt_in_one_random_tag_and_names_its_source():
    prompt = compose.build_compose_prompt("email", "choreo guide", EXCERPTS)
    tag = prompt.split("<excerpt_")[1].split(">")[0]
    assert prompt.count(f"<excerpt_{tag}>") == 2 and prompt.count(f"</excerpt_{tag}>") == 2
    assert "Source: Choreo guide\nPart: Page 2\nChoreo ships APIs." in prompt
    assert "What the salesperson searched for: choreo guide" in prompt
    assert compose.COMPOSE_INSTRUCTIONS["email"] in prompt


def test_the_excerpt_tag_changes_with_every_request_so_a_document_cannot_guess_it():
    tags = {compose.build_compose_prompt("plain", "q", EXCERPTS).split("<excerpt_")[1].split(">")[0] for _ in range(5)}
    assert len(tags) == 5


def test_the_salespersons_own_request_is_included_only_for_a_custom_message():
    custom = compose.build_compose_prompt("custom", "q", EXCERPTS, "a short speech")
    assert "The salesperson's request, in their own words: a short speech" in custom
    assert "own words" not in compose.build_compose_prompt("email", "q", EXCERPTS, "a short speech")


def test_every_kind_of_message_has_its_own_instructions():
    assert set(compose.COMPOSE_INSTRUCTIONS) == {"email", "chat", "plain", "explain", "custom"}


# ---- asking Claude (fake)


class FakeClaude:
    """Gives out the prepared replies one by one - a reply that is an exception is raised instead."""

    def __init__(self, *replies):
        self.replies, self.calls = list(replies), []
        self.messages = types.SimpleNamespace(create=self._create)

    def _create(self, **request):
        self.calls.append(request)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def reply(text, stop_reason="end_turn"):
    return types.SimpleNamespace(stop_reason=stop_reason, content=[types.SimpleNamespace(type="text", text=text)])


def status_error(code):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return anthropic.APIStatusError("failed", response=httpx.Response(code, request=request), body=None)


@pytest.fixture
def claude(monkeypatch):
    def install(*replies):
        fake = FakeClaude(*replies)
        monkeypatch.setattr(compose, "_client", fake)
        monkeypatch.setattr(compose, "time", types.SimpleNamespace(sleep=lambda seconds: None))
        return fake

    return install


def test_a_message_is_written_from_claudes_reply_with_any_web_address_removed(claude):
    fake = claude(reply("Subject: Guide\n\nRead it at https://example.com/x today."))
    text = compose.compose_message("email", "guide", EXCERPTS)
    assert text == "Subject: Guide\n\nRead it at today."
    request = fake.calls[0]
    assert request["system"] == compose.COMPOSE_SYSTEM_PROMPT
    assert request["max_tokens"] == compose._COMPOSE_MAX_TOKENS
    assert "Choreo ships APIs." in request["messages"][0]["content"]


def test_an_unknown_kind_of_message_is_refused_before_claude_is_asked(claude):
    fake = claude()
    with pytest.raises(ValueError, match="Unknown kind of message"):
        compose.compose_message("poem", "q", EXCERPTS)
    assert fake.calls == []


@pytest.mark.parametrize("purpose", [None, "", "   "])
def test_a_custom_message_needs_the_salespersons_own_words(claude, purpose):
    fake = claude()
    with pytest.raises(ValueError, match="own words"):
        compose.compose_message("custom", "q", EXCERPTS, purpose)
    assert fake.calls == []


def test_the_salespersons_request_is_trimmed_before_it_is_used(claude):
    fake = claude(reply("A speech."))
    compose.compose_message("custom", "q", EXCERPTS, "  a short speech  ")
    assert "own words: a short speech\n" in fake.calls[0]["messages"][0]["content"]


def test_a_refusal_is_reported_and_not_asked_again(claude):
    fake = claude(reply("I can't.", stop_reason="refusal"), reply("second try"))
    with pytest.raises(RuntimeError, match="declined"):
        compose.compose_message("chat", "q", EXCERPTS)
    assert len(fake.calls) == 1


def test_an_empty_reply_is_reported_and_not_asked_again(claude):
    fake = claude(reply("   "), reply("second try"))
    with pytest.raises(RuntimeError, match="empty"):
        compose.compose_message("chat", "q", EXCERPTS)
    assert len(fake.calls) == 1


def test_a_reply_that_is_only_a_web_address_counts_as_empty(claude):
    claude(reply("https://example.com/only-a-link"))
    with pytest.raises(RuntimeError, match="empty message"):
        compose.compose_message("chat", "q", EXCERPTS)


def test_a_reply_cut_off_by_the_length_limit_ends_at_a_whole_sentence(claude):
    claude(reply("First point. Second point. A third that was cut o", stop_reason="max_tokens"))
    assert compose.compose_message("plain", "q", EXCERPTS) == "First point. Second point."


def test_a_busy_or_failing_server_is_tried_once_more_then_given_up_on(claude):
    fake = claude(status_error(529), status_error(500))
    with pytest.raises(RuntimeError, match="Failed to write the message"):
        compose.compose_message("chat", "q", EXCERPTS)
    assert len(fake.calls) == compose.GENERATION_MAX_RETRIES + 1


def test_a_failure_that_then_works_gives_the_second_reply(claude):
    claude(status_error(429), reply("It worked."))
    assert compose.compose_message("chat", "q", EXCERPTS) == "It worked."


def test_a_bad_request_is_not_repeated(claude):
    fake = claude(status_error(400), reply("never reached"))
    with pytest.raises(RuntimeError, match="Failed to write the message"):
        compose.compose_message("chat", "q", EXCERPTS)
    assert len(fake.calls) == 1


def test_a_connection_failure_is_tried_again(claude):
    connection_error = anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com"))
    fake = claude(connection_error, reply("Back online."))
    assert compose.compose_message("chat", "q", EXCERPTS) == "Back online."
    assert len(fake.calls) == 2
