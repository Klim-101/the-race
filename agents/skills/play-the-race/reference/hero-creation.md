# Choosing the hero: the tavern

The player does not build a detective. The tavern puts three forward and the player goes into the run with one of them. Everything on a card comes from `hero_offer`; you add the voice, never a fact.

## The steps

1. **The three.** Call `hero_offer`. Present the three in the narrator's voice, one short paragraph in all (or one or two lines each): the name, who they were before (the background), what they are good at (the build) and, if the card has one, the mood they carry (the signal). Introduce them as people in a tavern, not as a table. Say only that every one of them hides something, never what. Never show numbers, ids or the `build` word itself.
2. **The pick.** One `AskUserQuestion` with the three heroes as options (the name as the label, one line as the description), and, while `rerollsLeft` is above 0, a fourth option for three others. The player's own words come through "Other": a name in the text is a pick, "someone else" is a re-roll, and a request for a detective of their own making is the hand-made path below.
3. **Three others.** Call `hero_offer` with `reroll: true`, once. If it is refused (`no-rerolls-left`), say in a line that the choice is between these three and ask again. A re-roll drops any hero already picked.
4. **One line to confirm,** then `hero_pick` with the `choiceId`. If the player wants another name for the hero, ask for it and pass it as `name`; otherwise keep the card's. The result is the hero and `hiddenTraitCount`: tell the player in a line that the hero hides something, and do not guess what.

If `AskUserQuestion` is not available, give the same options as a short numbered list the player can answer with a number.

## The hand-made path

Only when the player asks for a hero of their own making (and never offered by you): ask for the name, then who they are (gender, background, signal), then the build, one small step at a time, and call `hero_create`. The ids and the points are in the `run_new` result (`backgrounds`, `signals`, `skillPresets`, `skillPoints`, `maxSkillLevel`). A build is a `skills` object taken exactly from a preset; a hand-made spread adds up to exactly `skillPoints`, with no skill above `maxSkillLevel` and all six skills named (perception, reasoning, social, pressure, tech, contacts). If it refuses, say in a sentence what to change and ask only that again.

## Wording of the cards

Say these in the player's language; the ids are never shown.

| id (background) | English                                           | Русский                                      |
| --------------- | ------------------------------------------------- | -------------------------------------------- |
| `police`        | Police: years on the force, contacts at the desk. | Полиция: годы службы и связи в участке.      |
| `journalist`    | Journalist: curious, sharp, gets people talking.  | Журналист: любопытство и умение разговорить. |
| `locksmith`     | Locksmith: hands that know locks and doors.       | Слесарь: руки, которые знают замки и двери.  |
| `analyst`       | Analyst: numbers, tables, a cold head.            | Аналитик: цифры, таблицы, холодная голова.   |

| id (signal)   | English                                                                       | Русский                                                                          |
| ------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `in-love`     | In love: warm and distracted; someone to come back to, a bad word hurts more. | Влюблён: рассеянно-тёплый; есть к кому возвращаться, плохое слово ранит сильнее. |
| `burnt-out`   | Burnt out: flat and dry; nothing left to lose, never fully rested.            | Выгорел: сухой и ровный; терять нечего, никогда не отдыхает до конца.            |
| `feeling-low` | Feeling low: quiet and heavy; notices more when brooding, dulled senses.      | Хандрит: тихий и тяжёлый; в раздумьях замечает больше, чувства притуплены.       |
| none          | No signal.                                                                    | Без сигнала.                                                                     |

| id (build)     | English                                             | Русский                                            |
| -------------- | --------------------------------------------------- | -------------------------------------------------- |
| `observer`     | Observer: sharp eyes and a steady mind.             | Наблюдатель: острый глаз и ровный ум.              |
| `interrogator` | Interrogator: leans on people, reads them, pushes.  | Следователь: давит на людей, читает их, дожимает.  |
| `analyst`      | Analyst: reasoning and technology.                  | Аналитик: рассуждение и техника.                   |
| `networker`    | Networker: talks to everyone and knows who to call. | Связной: говорит со всеми и знает, кому позвонить. |

For a build, add its two or three strongest skills in plain words from the numbers in the card's `skills`; do not invent strengths it does not have.
