import type { getDeployments, getDeployTokens, planRemote } from './environments.remote';

export type DeployToken = Awaited<ReturnType<typeof getDeployTokens>>[number];

export type Deployment = Awaited<ReturnType<typeof getDeployments>>[number];

export type RemotePlan = Awaited<ReturnType<typeof planRemote>>;

export type Direction = 'publish' | 'pull';
