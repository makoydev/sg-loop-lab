import type { PullRequest } from '../types'
import { agent } from './agent'
import { cache } from './cache'
import { refunds } from './refunds'

/** The pull requests under review, in the order they appear as scenarios. */
export const PULL_REQUESTS: PullRequest[] = [refunds, agent, cache]
