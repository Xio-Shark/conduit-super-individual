import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { applyPopularTagsTopFive } from "./popularTagsTopFive.js";

const TAG_BUTTON = `import { useFeedContext } from "../../context/FeedContext";

function TagButton({ tagsList }) {
  const { changeTab } = useFeedContext();

  const handleClick = (e) => {
    changeTab(e, "tag");
  };

  return tagsList.slice(0, 50).map((name) => (
    <button className="tag-pill tag-default" key={name} onClick={handleClick}>
      {name}
    </button>
  ));
}

export default TagButton;
`;

const STYLES = `.tag-pill {
  display: inline-block;
}
`;

test("applyPopularTagsTopFive highlights first five tags", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "popular-tags-skill-"));
  const tagPath = "frontend/src/components/PopularTags/TagButton.jsx";
  const stylePath = "frontend/src/styles.css";
  await mkdir(path.dirname(path.join(root, tagPath)), { recursive: true });
  await writeFile(path.join(root, tagPath), TAG_BUTTON);
  await writeFile(path.join(root, stylePath), STYLES);

  const sandbox = {
    readText: (file) => readFile(path.join(root, file), "utf8"),
    writeText: (file, content) => writeFile(path.join(root, file), content),
  };

  const result = await applyPopularTagsTopFive(sandbox);
  const tagButton = await readFile(path.join(root, tagPath), "utf8");
  const styles = await readFile(path.join(root, stylePath), "utf8");

  assert.equal(result.changedFiles.length, 2);
  assert.match(tagButton, /tag-top-five/);
  assert.match(tagButton, /Top \{index \+ 1\}/);
  assert.match(styles, /\.tag-top-five/);
});
