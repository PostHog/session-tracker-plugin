import { PluginEvent, PluginMeta, PluginAttachment } from '@posthog/plugin-scaffold'

declare var posthog: {
    capture: (eventName: string, properties: Record<string,any>) => void
}

async function processEvent(event: PluginEvent, { storage }: PluginMeta) {
    if (['session_started', 'session_ended'].includes(event.event)) {
        return event
    }

    const THIRTY_MINUTES = 1000*60*30

    // Last event by the user
    const userLastSeen = await storage.get(`last_seen_${event.distinct_id}`, 0) as number

    // Last registered session_start by the user 
    const userLastSessionStarted = await storage.get(`last_session_started_${event.distinct_id}`, 0) as number

    let isFirstEventInSession = false

    if (!event.properties) {
        event['properties'] = {}
    }

    const timestamp = event.timestamp

    if (timestamp) {
        const parsedTimestamp = new Date(timestamp).getTime()
        const timeSinceLastSeen = parsedTimestamp - userLastSeen
        isFirstEventInSession = timeSinceLastSeen > THIRTY_MINUTES

        storage.set(`last_seen_${event.distinct_id}`, parsedTimestamp)

        // If it's been over 30min since the user had an event, it's a new session
        if (isFirstEventInSession) {
            posthog.capture(
                'session_started', 
                { 
                    distinct_id: event.distinct_id, 
                    time_since_last_seen: !userLastSeen ? 0 : timeSinceLastSeen,
                    // backdate to when session _actually_ started
                    timestamp: new Date(timestamp).toISOString(), 
                    trigger_event: event.event
                }
            )
            storage.set(`last_session_started_${event.distinct_id}`, parsedTimestamp)

            // If we've started a new session, another session must have ended
            if (userLastSessionStarted) {
                posthog.capture(
                    'session_ended',
                    {
                        // backdate the session end to the timestamp last event before the new session
                        timestamp: new Date(userLastSeen).toISOString(), 
                        distinct_id: event.distinct_id, 
                        session_duration: userLastSeen - userLastSessionStarted
                    }
                )
            }
        }
        
    }

    event.properties['is_first_event_in_session'] = isFirstEventInSession

    return event
}

module.exports = {
    processEvent,
}