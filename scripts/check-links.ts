import * as fs from "node:fs";
import * as path from "node:path";

interface BrokenLink {
  sourceFile: string;
  target: string;
  resolvedPath?: string;
  reason: string;
}

interface HeadingCache {
  [filePath: string]: Set<string>;
}

const headingCache: HeadingCache = {};

function githubSlugify(heading: string): string {
  // Strip markdown links and code formatting from heading title
  let text = heading.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/[*_~]/g, "");
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function getHeadingsForFile(filePath: string): Set<string> {
  const normalized = path.normalize(filePath);
  if (headingCache[normalized]) {
    return headingCache[normalized];
  }
  const headings = new Set<string>();
  if (!fs.existsSync(normalized)) {
    return headings;
  }
  const content = fs.readFileSync(normalized, "utf-8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      const slug = githubSlugify(match[1]);
      if (slug) headings.add(slug);
    }
  }
  headingCache[normalized] = headings;
  return headings;
}

function isIgnored(target: string): boolean {
  const trimmed = target.trim();
  if (!trimmed) return true;

  // External URLs & protocols
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("data:")
  ) {
    return true;
  }

  // Placeholder URLs (such as {{LIVE_CUSTOMER_URL}})
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    return true;
  }

  // Legitimate site-absolute application routes
  if (
    trimmed.startsWith("/api/") ||
    trimmed.startsWith("/t/") ||
    trimmed === "/demo" ||
    trimmed.startsWith("/demo") ||
    trimmed === "/kitchen" ||
    trimmed.startsWith("/kitchen") ||
    trimmed === "/admin" ||
    trimmed.startsWith("/admin") ||
    trimmed === "/" ||
    trimmed.startsWith("/images/") ||
    trimmed.startsWith("/media/") ||
    trimmed.startsWith("/icons/") ||
    trimmed.startsWith("/fonts/")
  ) {
    return true;
  }

  return false;
}

function stripCodeBlocks(content: string): string {
  // Replace fenced code blocks with empty lines to preserve line count
  return content.replace(/```[\s\S]*?```/g, (match) => {
    const lineCount = match.split("\n").length - 1;
    return "\n".repeat(lineCount);
  });
}

function extractLinks(content: string): string[] {
  const links: string[] = [];
  const textWithoutCode = stripCodeBlocks(content);

  // Markdown links & images: [text](target) and ![alt](target)
  const mdRegex = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdRegex.exec(textWithoutCode)) !== null) {
    links.push(mdMatch[1]);
  }

  // HTML href / src attributes: <a href="...">, <img src="...">
  const htmlRegex = /<(?:a|img|source)\b[^>]*(?:href|src)=["']([^"']+)["']/gi;
  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = htmlRegex.exec(textWithoutCode)) !== null) {
    links.push(htmlMatch[1]);
  }

  return links;
}

function checkFileLinks(filePath: string, rootDir: string): BrokenLink[] {
  const broken: BrokenLink[] = [];
  const content = fs.readFileSync(filePath, "utf-8");
  const links = extractLinks(content);
  const fileDir = path.dirname(filePath);

  for (const rawTarget of links) {
    if (isIgnored(rawTarget)) {
      continue;
    }

    // Split off query parameters and fragment
    const [pathAndQuery, fragment] = rawTarget.split("#");
    const cleanPath = pathAndQuery.split("?")[0];
    let decodedPath = "";
    try {
      decodedPath = decodeURIComponent(cleanPath);
    } catch {
      decodedPath = cleanPath;
    }

    let targetFilePath = filePath;
    if (decodedPath) {
      if (path.isAbsolute(decodedPath)) {
        targetFilePath = path.join(rootDir, decodedPath.replace(/^[/\\]+/, ""));
      } else {
        targetFilePath = path.resolve(fileDir, decodedPath);
      }
    }

    // Check if target file or directory exists
    if (!fs.existsSync(targetFilePath)) {
      broken.push({
        sourceFile: path.relative(rootDir, filePath),
        target: rawTarget,
        resolvedPath: path.relative(rootDir, targetFilePath),
        reason: `Target file or directory does not exist: ${path.relative(rootDir, targetFilePath)}`,
      });
      continue;
    }

    // If target is directory, check if it has README.md or is an existing directory
    const stat = fs.statSync(targetFilePath);
    if (stat.isDirectory()) {
      continue;
    }

    // If anchor fragment exists and target is markdown, check if anchor heading exists
    if (fragment && targetFilePath.endsWith(".md")) {
      const decodedFragment = decodeURIComponent(fragment).toLowerCase();
      const headings = getHeadingsForFile(targetFilePath);
      if (!headings.has(decodedFragment)) {
        broken.push({
          sourceFile: path.relative(rootDir, filePath),
          target: rawTarget,
          resolvedPath: path.relative(rootDir, targetFilePath),
          reason: `Heading anchor '#${decodedFragment}' not found in ${path.relative(rootDir, targetFilePath)}`,
        });
      }
    }
  }

  return broken;
}

function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".git") {
        results.push(...findMarkdownFiles(fullPath));
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

export function main() {
  const rootDir = process.cwd();
  console.log("🔗 DinePulse Documentation Link Checker");
  console.log("=========================================");

  const targetFiles: string[] = [];
  const readmePath = path.join(rootDir, "README.md");
  if (fs.existsSync(readmePath)) {
    targetFiles.push(readmePath);
  }

  const docsDir = path.join(rootDir, "docs");
  targetFiles.push(...findMarkdownFiles(docsDir));

  console.log(`Found ${targetFiles.length} Markdown documentation files to inspect.`);

  let totalLinksChecked = 0;
  const allBroken: BrokenLink[] = [];

  for (const file of targetFiles) {
    const broken = checkFileLinks(file, rootDir);
    const content = fs.readFileSync(file, "utf-8");
    const count = extractLinks(content).filter((l) => !isIgnored(l)).length;
    totalLinksChecked += count;

    if (broken.length > 0) {
      allBroken.push(...broken);
    }
  }

  console.log(`Checked ${totalLinksChecked} repository-relative links across ${targetFiles.length} files.\n`);

  if (allBroken.length > 0) {
    console.error("❌ Broken relative links found:");
    for (const b of allBroken) {
      console.error(`  - In [${b.sourceFile}]: target "${b.target}"`);
      console.error(`    ↳ Reason: ${b.reason}`);
    }
    console.error(`\nTotal broken links: ${allBroken.length}`);
    process.exit(1);
  }

  console.log(`✅ All ${totalLinksChecked} relative links and heading anchors are valid.`);
  process.exit(0);
}

if (require.main === module || process.argv[1]?.includes("check-links")) {
  main();
}
