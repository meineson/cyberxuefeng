import { webSearchTool, getSearchRuntimeInfo } from './websearch.js';
import { listSkillFilesTool } from './skill-file-list.js';
import { readSkillFileTool } from './skill-file-reader.js';

export function getEnabledTools() {
  const searchRuntime = getSearchRuntimeInfo();
  return [
    listSkillFilesTool,
    readSkillFileTool,
    ...(searchRuntime.enabled ? [webSearchTool] : []),
  ];
}

export function getToolNames() {
  return getEnabledTools().map((item) => item.name);
}

export function getSearchType() {
  const searchRuntime = getSearchRuntimeInfo();
  return searchRuntime.enabled ? searchRuntime.searchType : '无';
}

export default getEnabledTools;
