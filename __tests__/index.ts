const {
    createEvent,
    createIdentify,
    createPageview,
    createCache,
    getMeta,
    resetMeta,
    clone,
} = require('@posthog/plugin-scaffold/test/utils.js')
const { processEvent } = require('../index')


declare var posthog: {
    capture: jest.Mock<any, any>
}

global.posthog = {
    capture: jest.fn(),
}

test('processEvent tracks sessions correctly', async () => {

    const event0 = createEvent({ event: 'Event #0 in First Session', timestamp: '2021-04-16T13:10:00.070Z' })
    const event1 = createEvent({ event: 'Event #1 in First Session', timestamp: '2021-04-16T13:15:00.070Z' })
    const event2 = createEvent({ event: 'Event #0 in Second Session', timestamp: '2021-04-16T13:46:00.070Z' })


    // Session 1 start tracked correctly
    const processedEvent0 = await processEvent(clone(event0), getMeta())
    expect(processedEvent0).toEqual({
        ...event0,
        properties: {
            is_first_event_in_session: true
        },
    })

    // Session 1 second event not counted as a new start
    const processedEvent1 = await processEvent(clone(event1), getMeta())
    expect(processedEvent1).toEqual({
        ...event1,
        properties: {
            is_first_event_in_session: false
        },
    })

    // Session 2 start tracked correctly
    const processedEvent2 = await processEvent(clone(event2), getMeta())
    expect(processedEvent2).toEqual({
        ...event2,
        properties: {
            is_first_event_in_session: true
        },
    })


    // session_started 2x + session_ended 1x
    expect(posthog.capture).toHaveBeenCalledTimes(3)


    // Session ended tracked correctly
    expect(posthog.capture).toHaveBeenLastCalledWith(
        'session_ended',
        {
            distinct_id: '007',
            session_duration: 300000, // 5 minutes: time between the two events in session 1
            timestamp: "2021-04-16T13:15:00.070Z" // time of event #1 from session 1
        }
    )

})

