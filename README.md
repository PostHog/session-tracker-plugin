# Session Tracker Plugin

This plugin:

- Emits `session_started` events
- Adds a property `is_first_event_in_session` to the first event in a given session
- Emits `session_ended` events with a property `session_duration`
