# Making the hero: a short poll

Making the hero is a poll, one small step at a time, in the player's language. Never show the whole form at
once and never ask for the points as a list of numbers.

## The steps

1. **Name.** One plain question in chat: what is the detective called? Nothing else in that message.
2. **Who they are.** One `AskUserQuestion` call with three questions: gender (`female`, `male`, `nonbinary`),
   background (the ids of `backgrounds`) and character signal (the ids of `signals`, plus "none"). Use the
   wording below for the options, and keep each description to one short line.
3. **How they are built.** One `AskUserQuestion` call with one question: the builds in `skillPresets`, each
   named and described as below, and the player's own "Other" for a hand-made spread. A choice of an id is a
   `skills` object taken exactly from the preset.
4. **Hand-made spread.** Only if the player asked for one: ask for the points in plain words ("a lot of
   perception, a little pressure"), turn them into numbers that add up to exactly `skillPoints` with no skill
   above `maxSkillLevel`, and say the result back in one line before using it. All six skills exist and the
   engine counts every one: perception, reasoning, social, pressure, tech, contacts. Never drop one.
5. **One line to confirm,** then call `hero_create`. If it refuses, say in a sentence what has to change
   (the message tells you) and ask only that question again.

If `AskUserQuestion` is not available, ask the same questions one per message with the options as a short
numbered list the player can answer with a number.

## Wording of the options

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

For a build, add its two or three strongest skills in plain words from the numbers in `skillPresets`; do not
invent strengths it does not have.
