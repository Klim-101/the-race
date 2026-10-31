# Choosing the hero: the tavern

The player does not build a detective. The tavern puts three forward and the player goes into the run with one of them. Everything on a card comes from `hero_offer`; you add the voice, never a fact.

## The steps

1. **The three.** Call `hero_offer`. Present the three in the tavern's outside voice, one short paragraph in all (or one or two lines each): the name, who they were before (the background), what they are good at (the build) and, if the card has one, the mood they carry (the signal). Introduce them as people in a tavern, not as a table. Say only that every one of them hides something, never what. Never show numbers, ids or the `build` word itself.
2. **The pick.** One `AskUserQuestion` with the three heroes as options (the name as the label, one line as the description), and, while `rerollsLeft` is above 0, a fourth option for three others. The player's own words come through "Other": a name in the text is a pick, "someone else" is a re-roll, and a request for a detective of their own making is the hand-made path below.
3. **Three others.** Call `hero_offer` with `reroll: true`, once. If it is refused (`no-rerolls-left`), say in a line that the choice is between these three and ask again. A re-roll drops any hero already picked.
4. **One line to confirm,** then `hero_pick` with the `choiceId`. If the player wants another name for the hero, ask for it and pass it as `name`; otherwise keep the card's. The result is the hero and `hiddenTraitCount`: tell the player in a line that the hero hides something, and do not guess what.

If `AskUserQuestion` is not available, give the same options as a short numbered list the player can answer with a number.

## The hand-made path

Only when the player asks for a hero of their own making (and never offered by you): ask for the name, then who they are (gender, background, signal), then the build, one small step at a time, and call `hero_create`. The ids and the points are in the `run_new` result (`backgrounds`, `signals`, `skillPresets`, `skillPoints`, `maxSkillLevel`). A build is a `skills` object taken exactly from a preset; a hand-made spread adds up to exactly `skillPoints`, with no skill above `maxSkillLevel` and all six skills named (perception, reasoning, social, pressure, tech, contacts). If it refuses, say in a sentence what to change and ask only that again.

The tavern is told in an outside voice. The moment the player picks, the story turns to the hero: the first line after `hero_pick` is the hero's own thought, in the first person (see `hero-voice.md`).

## Wording of the cards

Say these in the player's language; the ids are never shown.

| id (background)         | English                                                                     | Русский                                                                     |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `police`                | Police: years on the force, contacts at the desk.                           | Полиция: годы службы и связи в участке.                                     |
| `journalist`            | Journalist: curious, sharp, gets people talking.                            | Журналист: любопытство и умение разговорить.                                |
| `locksmith`             | Locksmith: hands that know locks and doors.                                 | Слесарь: руки, которые знают замки и двери.                                 |
| `analyst`               | Analyst: numbers, tables, a cold head.                                      | Аналитик: цифры, таблицы, холодная голова.                                  |
| `bus-driver`            | Bus driver: knows every street and who rides at night.                      | Водитель автобуса: знает каждую улицу и тех, кто ездит ночью.               |
| `nurse`                 | Nurse: calm hands, notices who is hiding pain.                              | Медсестра: спокойные руки, замечает, кто скрывает боль.                     |
| `schoolteacher`         | Schoolteacher: patient, spots a lie before the bell.                        | Учитель: терпеливый, чует ложь раньше звонка.                               |
| `electrician`           | Electrician: reads wires, boxes and what was tampered with.                 | Электрик: читает проводку, щитки и следы вмешательства.                     |
| `sommelier`             | Sommelier: a nose for fakes and a memory for faces.                         | Сомелье: нюх на подделки и память на лица.                                  |
| `accountant`            | Accountant: a ledger is a story, and this one tells it straight.            | Бухгалтер: баланс — это рассказ, и этот умеет его читать.                   |
| `courier`               | Courier: fast on foot, knows every back door in town.                       | Курьер: быстрый на ногу, знает все чёрные ходы города.                      |
| `bailiff`               | Bailiff: knocks on doors nobody wants to open.                              | Судебный пристав: стучит в двери, которые никто не хочет открывать.         |
| `translator`            | Translator: hears what is meant, not just what is said.                     | Переводчик: слышит, что имели в виду, а не только что сказали.              |
| `librarian`             | Librarian: finds the one page that matters in a thousand.                   | Библиотекарь: найдёт единственную нужную страницу из тысячи.                |
| `pharmacist`            | Pharmacist: exact, reads labels and prescriptions twice.                    | Фармацевт: точный, дважды читает этикетки и рецепты.                        |
| `radio-presenter`       | Radio presenter: a voice people trust, and a talent for the right question. | Радиоведущий: голос, которому верят, и дар задать верный вопрос.            |
| `retired-inspector`     | Retired inspector: a long career, slower knees, the same sharp eye.         | Инспектор в отставке: долгая карьера, больные колени, прежний острый глаз.  |
| `dismissed-auditor`     | Dismissed auditor: knows where the numbers lie, and has a grudge.           | Уволенный аудитор: знает, где врут цифры, и держит обиду.                   |
| `investigative-blogger` | Investigative blogger: sources, screenshots and no editor to stop them.     | Блогер-расследователь: источники, скриншоты и никакого редактора над душой. |
| `street-private-eye`    | Street private eye: cheap office, wide network, no badge.                   | Частный сыщик: дешёвая контора, широкие связи, никакого значка.             |

A card may also carry a `lifeState`, what the hero is going through at the start. Add it in half a sentence after who they were, and never as a handicap: it is a place to begin from.

| id (life state)  | English                                                             | Русский                                                        |
| ---------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `just-dismissed` | Just dismissed: a free week and a bottle from the farewell.         | Только что уволен: свободная неделя и бутылка с проводов.      |
| `retired`        | Retired: nowhere to be, so a notebook is full.                      | На пенсии: спешить некуда, блокнот полон.                      |
| `on-leave`       | On leave: the phone is on, the desk is far away.                    | В отпуске: телефон включён, служебный стол далеко.             |
| `in-debt`        | In debt: long nights, a lot of coffee.                              | В долгах: долгие ночи, много кофе.                             |
| `newly-arrived`  | Newly arrived: a notebook for the streets, a stranger to everyone.  | Недавно в городе: блокнот для улиц и чужой для всех.           |
| `on-probation`   | On probation: someone is watching, so the nerves are kept in check. | На испытательном сроке: за ним следят, нервы держит лекарство. |

| id (signal)     | English                                                                           | Русский                                                                                        |
| --------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `in-love`       | In love: warm and distracted; someone to come back to, a bad word hurts more.     | Влюблён: рассеянно-тёплый; есть к кому возвращаться, плохое слово ранит сильнее.               |
| `burnt-out`     | Burnt out: flat and dry; nothing left to lose, never fully rested.                | Выгорел: сухой и ровный; терять нечего, никогда не отдыхает до конца.                          |
| `feeling-low`   | Feeling low: quiet and heavy; notices more when brooding, dulled senses.          | Хандрит: тихий и тяжёлый; в раздумьях замечает больше, чувства притуплены.                     |
| `restless`      | Restless: quick and watchful; sees more, sleeps worse.                            | Неусидчив: быстрый и зоркий; видит больше, спит хуже.                                          |
| `overconfident` | Overconfident: brisk and cocky; pushes well, rarely looks twice.                  | Самоуверен: бойкий и дерзкий; хорошо давит, редко смотрит дважды.                              |
| `homesick`      | Homesick: wistful and soft; comfortable among people, drifting by the second day. | Тоскует по дому: мягкий и задумчивый; уютно среди людей, со второго дня рассеян.               |
| `in-a-hurry`    | In a hurry: clipped and brisk; gets calls answered, skims the columns.            | Торопится: отрывистый и резкий; быстро добивается ответа на звонок, пробегает столбцы глазами. |
| none            | No signal.                                                                        | Без сигнала.                                                                                   |

| id (build)     | English                                             | Русский                                            |
| -------------- | --------------------------------------------------- | -------------------------------------------------- |
| `observer`     | Observer: sharp eyes and a steady mind.             | Наблюдатель: острый глаз и ровный ум.              |
| `interrogator` | Interrogator: leans on people, reads them, pushes.  | Следователь: давит на людей, читает их, дожимает.  |
| `analyst`      | Analyst: reasoning and technology.                  | Аналитик: рассуждение и техника.                   |
| `networker`    | Networker: talks to everyone and knows who to call. | Связной: говорит со всеми и знает, кому позвонить. |

For a build, add its two or three strongest skills in plain words from the numbers in the card's `skills`; do not invent strengths it does not have.
