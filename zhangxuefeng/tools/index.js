import { webSearchTool } from './gemini-search.js';
import { listSkillFilesTool } from './skill-file-list.js';
import { readSkillFileTool } from './skill-file-reader.js';

const TOOL_DEFINITIONS = [
  {
    enabled: true,
    searchType: '技能目录文件浏览',
    tool: listSkillFilesTool,
  },
  {
    enabled: true,
    searchType: '技能目录文件读取',
    tool: readSkillFileTool,
  },
  {
    enabled: Boolean(process.env.GEMINI_API_KEY),
    searchType: 'Gemini Google Search',
    tool: webSearchTool,
  },
];

export function getEnabledTools() {
  return TOOL_DEFINITIONS.filter((item) => item.enabled).map((item) => item.tool);
}

export function getToolNames() {
  return getEnabledTools().map((item) => item.name);
}

export function getSearchType() {
  const searchTool = TOOL_DEFINITIONS.find((item) => item.tool.name === 'web_search');
  return searchTool?.enabled ? searchTool.searchType : '无';
}

export default getEnabledTools;
