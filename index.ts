import {
    PluginEvent,
    CreatePluginMeta,
    MetaJobsInput,
} from '../plugin-scaffold/src/types'

declare var posthog: {
    capture: (eventName: string, properties: Record<string, any>) => void
}

type Meta = CreatePluginMeta<{
    jobs: {
        checkIfSessionIsOver: { distinct_id: string }
    }
}>

export async function processEvent(event: PluginEvent, { cache, jobs }: Meta) {
    // check if we're the first one to increment this key in the last 30 minutes
    if ((await cache.incr(`session_${event.distinct_id}`)) === 0) {
        // if so, dispatch a session start event
        posthog.capture('session start', { distinct_id: event.distinct_id })
        // and launch a job to check in 30min if the session is still alive
        jobs.checkIfSessionIsOver({ distinct_id: event.distinct_id }).runIn(30, 'minutes')
    }
    // make the key expire in 30min
    cache.expire(`session_${event.distinct_id}`, 30 * 60)

    // return the event because we don't want to lose it
    return event
}

export const jobs: MetaJobsInput<Meta> = {
    // a background job to check if a session is still in progress
    checkIfSessionIsOver: async ({ distinct_id }, { jobs, cache }) => {
        // check if there's a key that has not expired
        const ping = await cache.get(`session_${distinct_id}`, null)
        if (!ping) {
            // if it expired, dispatch the session end event
            posthog.capture('session end', { distinct_id })
        } else {
            // if the key is still there, check again in a minute
            jobs.checkIfSessionIsOver({ distinct_id }).runIn(1, 'minute')
        }
    },
}
