from django.utils.html import strip_tags


def sanitize_text(value):
    """Remove markup and control characters before storing user-provided text."""
    if not isinstance(value, str):
        return value
    cleaned = strip_tags(value).replace('\x00', '')
    return ''.join(
        character for character in cleaned
        if character in '\n\r\t' or ord(character) >= 32
    ).strip()
