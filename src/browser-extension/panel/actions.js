import * as effects from './effects/index.js';
import * as streamHelpers from './helpers/stream.js';
import currentEventIndex from './helpers/currentEventIndex.js';

const injectIntoArray = (arr, index, data) => {
  if (!arr) {
    const tmp = new Array(index);
    tmp[index] = data;
    return tmp;
  }
  arr[index] = data;
  return arr;
};

export const Init = () => {
  console.log('[panel]', 'init');
  return {
    queue: [],
    streams: {
      action: [],
      commit: [],
      effect: [],
      subscription: {},
    },
    inspectedEventIndex: null,
    eventIndex: 0,
    isPaused: false,
  };
};

const decode = (data) => {
  if (!data) return [];
  const type = streamHelpers.typeOfAction(data);
  switch (type) {
  case 'action': return [{ type, label: data.action.name, timeSlices: 1 }];
  case 'commit+effect': {
    return [
      { type: 'commit', label: 'COMMIT', timeSlices: 1, state: data.action[0], payload: data },
      { type: 'effect', label: data.action[1][0].name },
    ];
  }
  case 'commit': return [{ type, label: 'COMMIT', timeSlices: 1, state: data.action, payload: data }];
  default: return [];
  }
};

const mergeSubs = (subscription, eventIndex, data) => {
  if (data.type === 'subscription/start') {
    return {
      ...subscription,
      [data.name]: injectIntoArray(subscription[data.name], eventIndex, {
        type: 'subscription',
        label: data.name,
        timeSlices: 1,
        ended: false,
      }),
    };

  } else {
    const source = [...(subscription[data.name] || [])];
    const index = source.reverse().findIndex(s => s && !s.ended);
    if (index >= 0) {
      const lastIndex = source.length - index - 1;
      const sub = subscription[data.name][lastIndex];
      return {
        ...subscription,
        [data.name]: injectIntoArray(subscription[data.name], lastIndex, {
          ...sub,
          ended: true,
          timeSlices: eventIndex - lastIndex + 1,
        }),
      };
    }
  }

  return subscription;
};

export const ProcessDispatch = (state, { payload, wasQueued }) => {
  return [
    {
      ...state,
      queue: state.queue.concat(decode(payload)),
    },
    effects.outgoingMessage({
      type: 'dispatch',
      payload,
      wasQueued,
    }),
  ];
};

export const CommitDispatch = (state, { payload }) => {
  const items = state.queue.reduce((nextItems, event) => {
    return {
      ...nextItems,
      [event.type]: event,
    };
  }, {});
  const eventIndex = currentEventIndex(state) + 1;

  return [
    {
      ...state,
      queue: [],
      streams: {
        ...state.streams,
        action: injectIntoArray(state.streams.action, eventIndex, items.action),
        commit: injectIntoArray(state.streams.commit, eventIndex, items.commit),
        effect: injectIntoArray(state.streams.effect, eventIndex, items.effect),
        subscription: payload.reduce((subscription, event) => (
          mergeSubs(subscription, eventIndex, event)
        ), state.streams.subscription),
      },
    },
    effects.scrollEventsTo({ eventIndex }),
  ];
};

export const InspectEventIndex = (state, inspectedEventIndex) => {
  // console.log('InspectEventIndex', { state, inspectedEventIndex });
  const commit = state.streams.commit[inspectedEventIndex];
  if (!commit) {
    return state;
  }

  return [
    {
      ...state,
      inspectedEventIndex,
      isPaused: true,
    },
    [
      effects.scrollEventsTo({ eventIndex: inspectedEventIndex }),
      effects.outgoingMessage({
        type: 'dispatch',
        payload: commit.payload,
      }),
    ],
  ];
};

export const PauseApp = (state, { isPaused }) => {
  const eventIndex = currentEventIndex(state);

  return [
    {
      ...state,
      inspectedEventIndex: isPaused? (state.inspectedEventIndex || eventIndex) : null,
      isPaused,
    },
  ];
};
