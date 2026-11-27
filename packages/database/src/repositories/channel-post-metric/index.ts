import {
  countPostsPublished,
  findChannelPostForMetrics,
  findChannelPostsForMetrics,
  findInboxIdsOfDestinations,
  findLatestPostMetricPoints,
  findWorkspaceTimezone,
  listPostMetricPoints,
  listSocialPostMetricTargets,
  postMetricCoverage,
  sampleBestTimes,
  summarizePostMetrics,
  timeseriesPostMetrics,
  topPostsByMetric,
} from "./analytics"
import {
  countChannelPostMetricDefaultRows,
  createChannelPostMetricPartition,
  deleteChannelPostMetricDefaultRowsBefore,
  dropChannelPostMetricPartition,
  listChannelPostMetricDefaultMonths,
  listChannelPostMetricPartitions,
} from "./partitions"

export * from "./analytics"
export * from "./partitions"

/** Reads and maintenance over the post-metric snapshots, as one object for services. */
export const channelPostMetricRepository = {
  countDefaultRows: countChannelPostMetricDefaultRows,
  countPostsPublished,
  coverage: postMetricCoverage,
  createPartition: createChannelPostMetricPartition,
  deleteDefaultRowsBefore: deleteChannelPostMetricDefaultRowsBefore,
  dropPartition: dropChannelPostMetricPartition,
  findChannelPost: findChannelPostForMetrics,
  findChannelPosts: findChannelPostsForMetrics,
  findInboxIdsOfDestinations,
  findLatestPoints: findLatestPostMetricPoints,
  findWorkspaceTimezone,
  listDefaultMonths: listChannelPostMetricDefaultMonths,
  listPartitions: listChannelPostMetricPartitions,
  listPoints: listPostMetricPoints,
  listSocialPostTargets: listSocialPostMetricTargets,
  sampleBestTimes,
  summarize: summarizePostMetrics,
  timeseries: timeseriesPostMetrics,
  topPosts: topPostsByMetric,
}
