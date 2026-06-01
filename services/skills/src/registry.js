import {
  applyArticleListDisplayField,
  articleListDisplayFieldSkill,
} from "./articleListDisplayField.js";
import {
  applyArticleDraftIndicator,
  articleDraftIndicatorSkill,
} from "./articleDraftIndicator.js";
import {
  applyArticleDetailWordCount,
  articleDetailWordCountSkill,
} from "./articleDetailWordCount.js";
import {
  applyPopularTagsTopFive,
  popularTagsTopFiveSkill,
} from "./popularTagsTopFive.js";
import {
  applyArticleCoverImage,
  articleCoverImageSkill,
} from "./articleCoverImage.js";
import {
  applyCommentLikeCount,
  commentLikeCountSkill,
} from "./commentLikeCount.js";
import {
  applyCommentDraftCounter,
  commentDraftCounterSkill,
} from "./commentDraftCounter.js";
import {
  applyProfileAccountAge,
  profileAccountAgeSkill,
} from "./profileAccountAge.js";
import {
  applyArticleFavoriteFilterToggle,
  articleFavoriteFilterToggleSkill,
} from "./articleFavoriteFilterToggle.js";

const SKILLS = Object.freeze([
  {
    ...commentDraftCounterSkill,
    apply: applyCommentDraftCounter,
  },
  {
    ...profileAccountAgeSkill,
    apply: applyProfileAccountAge,
  },
  {
    ...articleFavoriteFilterToggleSkill,
    apply: applyArticleFavoriteFilterToggle,
  },
  {
    ...popularTagsTopFiveSkill,
    apply: applyPopularTagsTopFive,
  },
  {
    ...articleDraftIndicatorSkill,
    apply: applyArticleDraftIndicator,
  },
  {
    ...articleDetailWordCountSkill,
    apply: applyArticleDetailWordCount,
  },
  {
    ...articleListDisplayFieldSkill,
    apply: applyArticleListDisplayField,
  },
  {
    ...articleCoverImageSkill,
    apply: applyArticleCoverImage,
  },
  {
    ...commentLikeCountSkill,
    apply: applyCommentLikeCount,
  },
]);
const MIN_SKILL_MATCH_SCORE = 2;

export function findSkill(requirementCard) {
  const text = buildRequirementText(requirementCard);
  const ranked = SKILLS.map((skill) => ({
    skill,
    score: scoreSkillMatch(skill, text),
  }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const [best, second] = ranked;
  if (!best || best.score < MIN_SKILL_MATCH_SCORE) {
    throw new Error(`No Skill matched requirement: ${requirementCard.goal}`);
  }
  if (second?.score === best.score) {
    const candidates = ranked
      .filter((entry) => entry.score === best.score)
      .map((entry) => entry.skill.id)
      .join(", ");
    throw new Error(`Ambiguous Skill match for requirement: ${requirementCard.goal}; candidates: ${candidates}`);
  }
  return best.skill;
}

function buildRequirementText(requirementCard) {
  return [
    requirementCard.source_input,
    requirementCard.goal,
    ...requirementCard.scope.include,
    ...requirementCard.acceptance,
  ]
    .join(" ")
    .toLowerCase();
}

function scoreSkillMatch(skill, text) {
  return skill.appliesWhen.reduce((score, pattern) => {
    const normalized = pattern.toLowerCase();
    if (!text.includes(normalized)) {
      return score;
    }
    const weight = skill.intentWeights?.[pattern] ?? 1;
    return score + weight;
  }, 0);
}

export function listSkills() {
  return SKILLS.map(({ apply, crossStackCheck, ...skill }) => skill);
}
