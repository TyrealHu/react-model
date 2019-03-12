import Global from './global'
import { setPartialState, timeout, getCache } from './helper'
// -- Middlewares --

const tryCatch: Middleware<{}> = async (context, restMiddlewares) => {
  const { next } = context
  await next(restMiddlewares).catch((e: any) => console.log(e))
}

const getNewState: Middleware<{}> = async (context, restMiddlewares) => {
  const { action, modelName, consumerActions, params, next } = context
  context.newState =
    (await action(
      Global.State[modelName].state,
      consumerActions(Global.State[modelName].actions),
      params
    )) || null
  await next(restMiddlewares)
}

const getNewStateWithCache = (maxTime: number = 5000): Middleware => async (
  context,
  restMiddlewares
) => {
  const {
    action,
    modelName,
    consumerActions,
    params,
    next,
    actionName
  } = context
  context.newState =
    (await Promise.race([
      action(
        Global.State[modelName].state,
        consumerActions(Global.State[modelName].actions),
        params
      ),
      timeout(maxTime, getCache(modelName, actionName))
    ])) || null
  await next(restMiddlewares)
}

const setNewState: Middleware<{}> = async (context, restMiddlewares) => {
  const { modelName, newState, next } = context
  if (newState) {
    setPartialState(modelName, newState)
    await next(restMiddlewares)
  }
}

const stateUpdater: Middleware = async (context, restMiddlewares) => {
  const { modelName, next } = context
  context.type === 'function' && context.setState(Global.State[modelName].state)
  await next(restMiddlewares)
}

const devToolsListener: Middleware = async (context, restMiddlewares) => {
  console.group(
    `%c ${
      context.modelName
    } State Change %c ${new Date().toLocaleTimeString()}`,
    'color: gray; font-weight: lighter;',
    'color: black; font-weight: bold;'
  )
  console.log(
    '%c Previous',
    `color: #9E9E9E; font-weight: bold`,
    Global.State[context.modelName].state
  )
  console.log(
    '%c Action',
    `color: #03A9F4; font-weight: bold`,
    context.actionName
  )
  await context.next(restMiddlewares)
  if (Global.withDevTools) {
    Global.devTools.send(
      `${context.modelName}_${context.actionName}`,
      Global.State
    )
  }
  console.log(
    '%c Next',
    `color: #4CAF50; font-weight: bold`,
    Global.State[context.modelName].state
  )
  console.groupEnd()
}

const communicator: Middleware<{}> = async (context, restMiddlewares) => {
  const { modelName, next, actionName } = context
  if (Global.Setter.classSetter) {
    Global.Setter.classSetter(Global.State)
  }
  if (Global.Setter.functionSetter[modelName]) {
    Object.keys(Global.Setter.functionSetter[modelName]).map(key => {
      const setter = Global.Setter.functionSetter[modelName][key]
      if (setter) {
        if (
          !setter.depActions ||
          setter.depActions.indexOf(actionName) !== -1
        ) {
          setter.setState(Global.State[modelName].state)
        }
      }
    })
  }
  await next(restMiddlewares)
}

let actionMiddlewares = [getNewState, setNewState, stateUpdater, communicator]

if (process.env.NODE_ENV === 'production') {
  actionMiddlewares = [tryCatch, ...actionMiddlewares]
} else {
  actionMiddlewares = [devToolsListener, ...actionMiddlewares]
}

const middlewares = {
  tryCatch,
  getNewState,
  getNewStateWithCache,
  setNewState,
  stateUpdater,
  communicator,
  devToolsListener
}

const applyMiddlewares = async (
  middlewares: Middleware[],
  context: BaseContext
) => {
  context.next = (restMiddlewares: Middleware[]) =>
    restMiddlewares.length > 0 &&
    restMiddlewares[0](<Context>context, restMiddlewares.slice(1))
  if (middlewares.length > 0) {
    await middlewares[0](<Context>context, middlewares.slice(1))
  }
}

export { actionMiddlewares, applyMiddlewares, middlewares }
