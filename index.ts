import { PluginEvent, CreatePluginMeta, MetaJobsInput } from '../plugin-scaffold/src/types'

declare var posthog: {
    capture: (eventName: string, properties: Record<string, any>) => void
}

type Meta = CreatePluginMeta<{
    jobs: {
        checkIfSessionIsOver: { distinct_id: string }
    }
}>

const SESSION_LENGTH_MINUTES = 30
const SESSION_START_EVENT = 'session start'
const SESSION_END_EVENT = 'session end'

export async function onEvent(event: PluginEvent, { cache, jobs }: Meta) {
    // skip this for the session start/end events
    if (event.event === SESSION_START_EVENT || event.event === SESSION_END_EVENT) {
        return
    }
    // check if we're the first one to increment this key in the last ${SESSION_LENGTH_MINUTES} minutes
    if ((await cache.incr(`session_${event.distinct_id}`)) === 1) {
        // if so, dispatch a session start event
        posthog.capture(SESSION_START_EVENT, { distinct_id: event.distinct_id, timestamp: event.timestamp })
        // and launch a job to check in 30min if the session is still alive
        await jobs.checkIfSessionIsOver({ distinct_id: event.distinct_id }).runIn(SESSION_LENGTH_MINUTES, 'minutes')
    }
    // make the key expire in ${SESSION_LENGTH_MINUTES} min
    await cache.expire(`session_${event.distinct_id}`, SESSION_LENGTH_MINUTES * 60)
    await cache.set(`last_timestamp_${event.distinct_id}`, event.timestamp)
}

export const jobs: MetaJobsInput<Meta> = {
    // a background job to check if a session is still in progress
    checkIfSessionIsOver: async ({ distinct_id }, { jobs, cache }) => {
        // check if there's a key that has not expired
        const ping = await cache.get(`session_${distinct_id}`, null)
        if (!ping) {
            // if it expired, dispatch the session end event
            const timestamp = await cache.get(
                `last_timestamp_${distinct_id}`,
                new Date(new Date().valueOf() - SESSION_LENGTH_MINUTES * 60000).toISOString()
            )
            await cache.set(`last_timestamp_${distinct_id}`, null)
            posthog.capture(SESSION_END_EVENT, { distinct_id, timestamp: timestamp })
        } else {
            // if the key is still there, check again in a minute
            jobs.checkIfSessionIsOver({ distinct_id }).runIn(1, 'minute')
        }
    },
}
