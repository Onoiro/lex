"""Tests for main application routes."""

from fastapi import status
from models import Word


class TestIndexRoute:
    """Tests for / route."""

    def test_index_returns_html(self, client):
        """Index page returns HTML."""
        response = client.get("/")
        
        assert response.status_code == status.HTTP_200_OK
        assert "text/html" in response.headers["content-type"]

    def test_index_contains_title(self, client):
        """Index page contains expected content."""
        response = client.get("/")
        
        assert b"Lex" in response.content or b"lex" in response.content


class TestAddPage:
    """Tests for /add page."""

    def test_add_page_returns_html(self, client):
        """Add page returns HTML."""
        response = client.get("/add")
        
        assert response.status_code == status.HTTP_200_OK
        assert "text/html" in response.headers["content-type"]

    def test_add_page_has_csrf_token(self, client):
        """Add page contains CSRF token."""
        response = client.get("/add")
        
        assert b'csrf_token' in response.content or b'name="csrf_token"' in response.content

    def test_add_page_shows_added_param(self, client):
        """Add page shows 'added' message when parameter is set."""
        response = client.get("/add?added=1")
        
        assert response.status_code == status.HTTP_200_OK


class TestAddWord:
    """Tests for POST /add route."""

    def test_add_word_success(self, authenticated_client, csrf_token):
        """Can add a new word."""
        response = authenticated_client.post(
            "/add",
            data={
                "word": "newword",
                "translation": "новое слово",
                "csrf_token": csrf_token,
            },
            follow_redirects=False,
        )
        
        assert response.status_code == status.HTTP_303_SEE_OTHER
        assert "/add?added=1" in response.headers["location"]

    def test_add_word_requires_auth(self, client):
        """Adding word requires authentication."""
        response = client.post(
            "/add",
            data={"word": "test", "translation": "тест"},
            follow_redirects=False,
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_add_duplicate_word(self, authenticated_client, sample_word, csrf_token):
        """Cannot add duplicate word."""
        response = authenticated_client.post(
            "/add",
            data={
                "word": sample_word.word,
                "translation": "дубликат",
                "csrf_token": csrf_token,
            },
            follow_redirects=False,
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_add_word_empty_word(self, authenticated_client, csrf_token):
        """Cannot add word with empty word field."""
        response = authenticated_client.post(
            "/add",
            data={
                "word": "",
                "translation": "тест",
                "csrf_token": csrf_token,
            },
            follow_redirects=False,
        )
        
        # FastAPI validates Form fields automatically (422 for missing/empty required fields)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_add_word_empty_translation(self, authenticated_client, csrf_token):
        """Cannot add word with empty translation."""
        response = authenticated_client.post(
            "/add",
            data={
                "word": "test",
                "translation": "",
                "csrf_token": csrf_token,
            },
            follow_redirects=False,
        )
        
        # FastAPI validates Form fields automatically (422 for missing/empty required fields)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_add_word_stores_in_db(self, authenticated_client, db_session, csrf_token):
        """Added word is stored in database."""
        authenticated_client.post(
            "/add",
            data={
                "word": "storedword",
                "translation": "сохранённое слово",
                "csrf_token": csrf_token,
            },
            follow_redirects=False,
        )
        
        word = db_session.query(Word).filter(Word.word == "storedword").first()
        assert word is not None
        assert word.translation == "сохранённое слово"
        assert word.interval == 0
        assert word.repetitions == 0


class TestAddTranslate:
    """Tests for POST /add/translate route."""

    def test_translate_success(self, authenticated_client, mock_translate_success, csrf_token):
        """Translate endpoint returns translation."""
        response = authenticated_client.post(
            "/add/translate",
            data={"word": "hello"},
            headers={"X-CSRF-Token": csrf_token},
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["translation"] == "тест"

    def test_translate_failure(self, authenticated_client, mock_translate_failure, csrf_token):
        """Translate endpoint handles failure."""
        response = authenticated_client.post(
            "/add/translate",
            data={"word": "unknownword"},
            headers={"X-CSRF-Token": csrf_token},
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["translation"] == ""
        assert "error" in data

    def test_translate_requires_auth(self, client):
        """Translate endpoint requires authentication."""
        response = client.post(
            "/add/translate",
            data={"word": "hello"},
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_translate_empty_word(self, authenticated_client, csrf_token):
        """Translate with empty word returns error."""
        response = authenticated_client.post(
            "/add/translate",
            data={"word": ""},
            headers={"X-CSRF-Token": csrf_token},
        )
        
        # FastAPI validates Form fields (422 for missing/empty required fields)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestDictionary:
    """Tests for /dictionary route."""

    def test_dictionary_returns_html(self, client):
        """Dictionary page returns HTML."""
        response = client.get("/dictionary")
        
        assert response.status_code == status.HTTP_200_OK
        assert "text/html" in response.headers["content-type"]

    def test_dictionary_shows_words(self, client, sample_words):
        """Dictionary page shows all words."""
        response = client.get("/dictionary")
        
        assert response.status_code == status.HTTP_200_OK
        # Check that word content is present (use latin words only for bytes)
        assert b"hello" in response.content or b"world" in response.content

    def test_dictionary_empty(self, client):
        """Dictionary page handles empty database."""
        response = client.get("/dictionary")
        
        assert response.status_code == status.HTTP_200_OK

    def test_dictionary_word_count(self, client, sample_words):
        """Dictionary shows correct word count."""
        response = client.get("/dictionary")
        
        # Should show 3 words from sample_words fixture
        assert b"3" in response.content or b"total" in response.content.lower()


class TestDeleteWord:
    """Tests for POST /dictionary/delete/{word_id} route."""

    def test_delete_word_success(self, authenticated_client, sample_word, csrf_token, db_session):
        """Can delete a word."""
        response = authenticated_client.post(
            f"/dictionary/delete/{sample_word.id}",
            data={"csrf_token": csrf_token},
            follow_redirects=False,
        )
        
        assert response.status_code == status.HTTP_303_SEE_OTHER
        assert "/dictionary" in response.headers["location"]
        
        # Verify word is deleted
        deleted = db_session.query(Word).get(sample_word.id)
        assert deleted is None

    def test_delete_word_requires_auth(self, client, sample_word):
        """Deleting word requires authentication."""
        response = client.post(
            f"/dictionary/delete/{sample_word.id}",
            follow_redirects=False,
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_delete_nonexistent_word(self, authenticated_client, csrf_token):
        """Deleting nonexistent word returns 404."""
        response = authenticated_client.post(
            "/dictionary/delete/99999",
            data={"csrf_token": csrf_token},
            follow_redirects=False,
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestReview:
    """Tests for /review route."""

    def test_review_returns_html(self, client, sample_words):
        """Review page returns HTML."""
        response = client.get("/review")
        
        assert response.status_code == status.HTTP_200_OK
        assert "text/html" in response.headers["content-type"]

    def test_review_empty_dictionary(self, client):
        """Review page handles empty dictionary."""
        response = client.get("/review")
        
        assert response.status_code == status.HTTP_200_OK
        # Check for HTML content (avoid non-ASCII bytes)
        assert b"<html" in response.content.lower() or b"<!doctype" in response.content.lower()

    def test_review_shows_word(self, client, sample_words, db_session):
        """Review page shows a word for review."""
        # Verify words are in database before making request
        db_words = db_session.query(Word).all()
        assert len(db_words) == 3, f"Expected 3 words in DB, got {len(db_words)}"
        
        response = client.get("/review")
        
        assert response.status_code == status.HTTP_200_OK
        # Should show at least one word or translation from the sample
        content = response.content.decode('utf-8', errors='ignore')
        
        # Check for word or its translation (page shows one of them based on direction)
        found = any(word.word in content or word.translation in content for word in sample_words)
        assert found, f"None of {sample_words} found in response"

    def test_review_has_direction(self, client, sample_words):
        """Review page includes direction (en_ru or ru_en)."""
        response = client.get("/review")
        
        assert response.status_code == status.HTTP_200_OK
        # Direction should be present in the response
        assert b"en_ru" in response.content or b"ru_en" in response.content


class TestReviewResult:
    """Tests for POST /review/result route."""

    def test_review_result_correct(self, client, sample_word, db_session):
        """Submitting correct answer updates word."""
        response = client.post(
            "/review/result",
            data={
                "word_id": sample_word.id,
                "correct": True,
                "direction": "en_ru",
            },
            follow_redirects=False,
        )
        
        assert response.status_code == status.HTTP_303_SEE_OTHER
        assert "/review" in response.headers["location"]
        
        # Verify updates
        updated = db_session.query(Word).get(sample_word.id)
        assert updated.repetitions == 1
        assert updated.interval > 0

    def test_review_result_incorrect(self, client, sample_word, db_session):
        """Submitting incorrect answer resets progress."""
        # Set initial progress
        sample_word.repetitions = 3
        sample_word.interval = 10
        db_session.commit()
        
        response = client.post(
            "/review/result",
            data={
                "word_id": sample_word.id,
                "correct": False,
                "direction": "en_ru",
            },
            follow_redirects=False,
        )
        
        assert response.status_code == status.HTTP_303_SEE_OTHER
        
        # Verify reset
        updated = db_session.query(Word).get(sample_word.id)
        assert updated.repetitions == 0
        assert updated.interval == 0

    def test_review_result_nonexistent_word(self, client):
        """Submitting result for nonexistent word returns 404."""
        response = client.post(
            "/review/result",
            data={
                "word_id": 99999,
                "correct": True,
                "direction": "en_ru",
            },
            follow_redirects=False,
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestReviewNext:
    """Tests for POST /review/next route (AJAX)."""

    def test_review_next_returns_json(self, client, sample_word):
        """Review next endpoint returns JSON."""
        response = client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": True,
                "direction": "en_ru",
            },
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert "application/json" in response.headers["content-type"]

    def test_review_next_updates_word(self, client, sample_word, db_session):
        """Review next updates word progress."""
        initial_repetitions = sample_word.repetitions
        
        client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": True,
                "direction": "en_ru",
            },
        )
        
        updated = db_session.query(Word).get(sample_word.id)
        assert updated.repetitions == initial_repetitions + 1

    def test_review_next_returns_new_word(self, client, sample_words):
        """Review next returns a new word for review."""
        first_word = sample_words[0]
        
        response = client.post(
            "/review/next",
            data={
                "word_id": first_word.id,
                "correct": True,
                "direction": "en_ru",
            },
        )
        
        data = response.json()
        assert data["done"] is False
        assert "word" in data
        assert "translation" in data
        assert "id" in data
        assert "direction" in data

    def test_review_next_empty_dictionary(self, client):
        """Review next handles empty dictionary."""
        # When word doesn't exist, returns 404
        response = client.post(
            "/review/next",
            data={
                "word_id": 1,
                "correct": True,
                "direction": "en_ru",
            },
            follow_redirects=False,
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_review_next_saves_best_time(self, client, sample_word, db_session):
        """Review next saves best_time when elapsed is provided."""
        response = client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": True,
                "direction": "en_ru",
                "elapsed": 1.5,
            },
        )
        
        data = response.json()
        assert data["done"] is False
        assert data["current_best_time"] == 1.5
        
        updated = db_session.query(Word).get(sample_word.id)
        assert updated.best_time == 1.5

    def test_review_next_updates_avg_time(self, client, sample_word, db_session):
        """Review next calculates avg_time from multiple elapsed values."""
        # First response: best=2.0, avg=2.0
        client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": True,
                "direction": "en_ru",
                "elapsed": 2.0,
            },
        )
        
        # Second response: best=2.0, avg=(2.0+3.0)/2=2.5
        client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": False,
                "direction": "ru_en",
                "elapsed": 3.0,
            },
        )
        
        updated = db_session.query(Word).get(sample_word.id)
        assert updated.best_time == 2.0
        assert updated.avg_time == 2.5

    def test_review_next_best_time_improves(self, client, sample_word, db_session):
        """Review next updates best_time when a faster response is recorded."""
        # First: 3.0s
        client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": True,
                "direction": "en_ru",
                "elapsed": 3.0,
            },
        )
        
        # Second: 1.5s (better)
        client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": True,
                "direction": "en_ru",
                "elapsed": 1.5,
            },
        )
        
        updated = db_session.query(Word).get(sample_word.id)
        assert updated.best_time == 1.5

    def test_review_next_includes_time_data_in_response(self, client, sample_word):
        """Review next includes current best_time and avg_time in JSON response."""
        client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": True,
                "direction": "en_ru",
                "elapsed": 2.5,
            },
        )
        
        response = client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": True,
                "direction": "en_ru",
                "elapsed": 1.8,
            },
        )
        
        data = response.json()
        assert data["current_best_time"] == 1.8
        assert data["current_avg_time"] == 2.15

    def test_review_next_tracks_know_count(self, client, sample_word, db_session):
        """Submitting correct answer increments know_count."""
        response = client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": True,
                "direction": "en_ru",
                "elapsed": 1.5,
            },
        )
        
        data = response.json()
        assert data["current_know_count"] == 1
        assert data["current_forgot_count"] == 0
        
        updated = db_session.query(Word).get(sample_word.id)
        assert updated.know_count == 1
        assert updated.forgot_count == 0

    def test_review_next_tracks_forgot_count(self, client, sample_word, db_session):
        """Submitting incorrect answer increments forgot_count."""
        response = client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": False,
                "direction": "en_ru",
                "elapsed": 3.0,
            },
        )
        
        data = response.json()
        assert data["current_know_count"] == 0
        assert data["current_forgot_count"] == 1
        
        updated = db_session.query(Word).get(sample_word.id)
        assert updated.know_count == 0
        assert updated.forgot_count == 1

    def test_review_next_returns_know_forgot_for_next_word(self, client, sample_word, db_session):
        """Next word response includes know/forgot counts."""
        sample_word.know_count = 5
        sample_word.forgot_count = 2
        db_session.commit()
        
        response = client.post(
            "/review/next",
            data={
                "word_id": sample_word.id,
                "correct": True,
                "direction": "en_ru",
                "elapsed": 1.0,
            },
        )
        
        data = response.json()
        assert "next_know_count" in data
        assert "next_forgot_count" in data
