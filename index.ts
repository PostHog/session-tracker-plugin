import { Plugin } from '@posthog/plugin-scaffold'

declare var posthog: {
    capture: (eventName: string, properties: Record<string, any>) => void
}

type SessionTrackerPlugin = Plugin<{
    config: {
        sessionLength: string
        sessionStartEvent: string
        sessionEndEvent: string
    }
    global: {
        sessionLength: number
        sessionStartEvent: string
        sessionEndEvent: string
    }
    jobs: {
        checkIfSessionIsOver: { distinct_id: string }
    }
}>

export const setupPlugin: SessionTrackerPlugin['setupPlugin'] = ({ global, config }) => {
    global.sessionLength = parseInt(config.sessionLength) || 30
    global.sessionStartEvent = config.sessionStartEvent || 'Session start'
    global.sessionEndEvent = config.sessionEndEvent || 'Session end'
}

export const onEvent: SessionTrackerPlugin['onEvent'] = async (event, { cache, global, jobs }) => {
    // skip this for the session start/end events
    if (event.event === global.sessionStartEvent || event.event === global.sessionEndEvent) {
        return
    }
    // check if we're the first one to increment this key in the last ${global.sessionLength} minutes
    if ((await cache.incr(`session_${event.distinct_id}`)) === 1) {
        // if so, dispatch a session start event
        posthog.capture(global.sessionStartEvent, { distinct_id: event.distinct_id, timestamp: event.timestamp })
        // and launch a job to check in 30min if the session is still alive
        await jobs.checkIfSessionIsOver({ distinct_id: event.distinct_id }).runIn(global.sessionLength, 'minutes')
    }
    // make the key expire in ${global.sessionLength} min
    await cache.expire(`session_${event.distinct_id}`, global.sessionLength * 60)
    await cache.set(
        `last_timestamp_${event.distinct_id}`,
        event.timestamp || event.now || event.sent_at || new Date().toISOString()
    )
}

export const jobs: SessionTrackerPlugin['jobs'] = {
    // a background job to check if a session is still in progress
    checkIfSessionIsOver: async ({ distinct_id }, { jobs, cache, global }) => {
        // check if there's a key that has not expired
        const ping = await cache.get(`session_${distinct_id}`, null)
        if (!ping) {
            // if it expired, dispatch the session end event
            const timestamp = await cache.get(
                `last_timestamp_${distinct_id}`,
                new Date(new Date().valueOf() - global.sessionLength * 60000).toISOString()
            )

            await cache.set(`last_timestamp_${distinct_id}`, undefined)
            posthog.capture(global.sessionEndEvent, { distinct_id, timestamp })
        } else {
            // if the key is still there, check again in a minute
            jobs.checkIfSessionIsOver({ distinct_id }).runIn(1, 'minute')
        }
    },
}
