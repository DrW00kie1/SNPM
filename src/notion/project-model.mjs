export function projectPath(name, suffix = []) {
  return ["Projects", name, ...suffix].join(" > ");
}

export function pathFromSegments(segments) {
  return segments.join(" > ");
}

export function buildProjectRootNode(projectName, config) {
  return {
    title: projectName,
    children: config.projectStarter.children,
  };
}

export function expectedCanonicalSource(projectName, pathTitles) {
  return `Canonical Source: ${projectPath(projectName, pathTitles.slice(1))}`;
}
