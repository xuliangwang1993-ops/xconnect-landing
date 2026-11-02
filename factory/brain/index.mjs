// 总脑装配入口：一个函数把 total 接进现有服务。
//
// 后端宿主是工厂服务（xconnect-landing 的 workbench/server-voice.mjs）。本仓库
// 是客户端仓库，factory/brain 是与之逐字一致的快照；装配胶水需要宿主的
// session 解析（/api/chat 同一套 cookie）和 work_nodes store（/tree/api/nodes
// 同一个 store）。所以这里不重复实现业务，只做两件事：
//   1) 定好契约：{ store?, tree?, getSession } 由宿主注入；
//   2) 在宿主缺失时给出明确错误，而不是静默降级成"看起来能跑"。
//
// 本地/测试运行时（createLocalRuntime，见 test/brain-harness.mjs）会把工厂服务
// 的 tree.mjs 一起拷进来，用来验证"任务真的落进 work_nodes"。

import { createBrainStore } from './store.mjs';
import { createBrain } from './brain.mjs';
import { createBrainApi } from './api.mjs';

/**
 * @param {{getSession: Function, tree?: {upsert: Function, mode?: string, list?: Function},
 *          store?: object, brain?: object, env?: object, fetchImpl?: Function}} opts
 */
export function mountBrain({ getSession, tree, store, brain, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (typeof getSession !== 'function') throw new Error('mountBrain: getSession is required (same session as /api/chat)');
  if (!tree || typeof tree.upsert !== 'function') throw new Error('mountBrain: tree store is required (work_nodes; reused from /tree)');
  const s = store || createBrainStore({ env, fetchImpl });
  const b = brain || createBrain({ env, fetchImpl, store: s });
  const api = createBrainApi({ brain: b, store: s, tree, getSession });
  return { brain: b, store: s, api, handle: (req, res) => api.handle(req, res) };
}
