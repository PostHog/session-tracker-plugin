# First Time Event Tracker Plugin

## Important!

This plugin will only work on events ingested **after** the plugin was enabled. This means it **will** register events as being the first if there were events that occured **before** it was enabled. To mitigate this, you could consider renaming the relevant events and creating an [action](https://posthog.com/docs/features/actions) that matches both the old event name and the new one.

## Usage

This plugin will add the following two properties to events you specify:

- `is_event_first_ever`
- `is_event_first_for_user`
