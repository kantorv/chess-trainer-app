import { setup, assign, assertEvent, type ActorRef, type Snapshot } from 'xstate';
import { createActorContext } from '@xstate/react';

import { type UIMatch, type Location } from 'react-router'

interface MachineContext {

    data: Record<string, any>


    //  files: ActorRefFrom<typeof fetchFileMachine>[];
}



type ApiEvent =
    | { type: 'EVENTS.API.READY' }
    | {type:  'EVENTS.API.ERROR'}

type NavigationEvent = | {
    type: 'EVENTS.NAVIGATION.LOCATION.UPDATE',
    location: Location
} | {
    type: 'EVENTS.NAVIGATION.ROUTER.MATCH.UPDATE',
    match: UIMatch
}

type EmptyEvent = {
    type: 'EVENTS.NOOP'
}


type MachineEvent =
    | ApiEvent | NavigationEvent | EmptyEvent



const boardWidgetMachine = setup({
    types: {} as {
        input: {

        },
        context: MachineContext,
        events: MachineEvent
    },
    actions: {
        log: (_, params?: { message: string }) => {
            console.log(`[log]: ${params ? params.message : "empty"}`);
        },
    },
    // actors: {
    //     boardSvc: boardDemoMachine
    // },
    guards: {
    }

}).createMachine({
    id: "mainsvc",
    context: ({ input }) => ({
        data: {}
    }),


    // ...
    entry: ({ context, event }) => console.log("mainsvc.entry", event),
    exit: ({ event }) => console.log("mainsvc.exit", event),
    initial: "idle",
    on: {

        'EVENTS.NAVIGATION.ROUTER.MATCH.UPDATE': [
            {
                guard: ({ context, event }) => event.match.pathname === "/board/",
                //target: ".catalogs_list.main",
                actions: [
                    ({ event }) => console.log("[mainsvc] EVENTS.NAVIGATION.ROUTER.MATCH.UPDATE::2-0", event)
                ]
                //   reenter:true
            },

            {
                actions: ({ event }) => console.log('EVENTS.NAVIGATION.ROUTER.MATCH.UPDATE: NO ACTION TAKEN!!', { ...event }),
            }
        ],

        'EVENTS.API.ERROR': {
            target: ".error"
        },

    },
    states: {

        idle: {
            entry: ({ event }) => console.log("mainsvc.application.idle.entry", event),
            exit: ({ event }) => console.log("mainsvc.application.idle.exit", event),

        },




        error: {
            entry: ({ event }) => console.log("mainsvc.application.error.entry", event),
            exit: ({ event }) => console.log("mainsvc.application.error.exit", event),
        },



    }
});



export const BoardWidgetContext = createActorContext(boardWidgetMachine);
export type BoardMainActorRef = ActorRef<Snapshot<unknown>, MachineEvent>;

