# Модель предметной области

## Глоссарий RU → EN
| RU | EN (код) |
|---|---|
| Категория | Category |
| Цель | Goal |
| Направление | direction |
| Майлстон | Milestone |
| Задача / практика | Practice |
| Вид активности | ActivityType |
| Слот | Slot |
| Набор (ротация) | RotationSet |
| Запись | Entry |
| Чеклист | ChecklistTemplate / ChecklistItem |
| Ретро | Review |

## Сущности

**Category** — name, color (из палитры).

**Goal** — title, category, direction (идентичность/зачем), kind: `ongoing | finite`,
status: `incubating | active | paused | achieved | released`, incubated_at, activated_at,
closed_at, close_note, visualization (по умолчанию от kind).

**Milestone** — goal, title, check_criterion (как продемонстрировать), due_date,
status: `open | achieved | missed | dropped`, achieved_at; для finite — target_volume.
У цели один текущий открытый майлстон; история сохраняется.

**Practice** — goal, title, unit (pages, minutes, sessions, km…), min_dose, norm_dose,
rhythm: `daily | per_period(n, week|month) | weekdays[...]`, preferred_day, slot,
mode: `core | rotation`, rotation_set, checklist_template, activity_types (для составных), icon.

**ActivityType** — practice, name, icon.

**Slot** — name, part_of_day, duration_min.

**RotationSet** — name, practices; расписание чередования (по неделям / выбор на планировании).

**Entry** — practice, date, amount, activity_type?, part_of_day?, checked_items[],
state: `planned | done | replaced`, replaced_activity_type?, note.

**Review** — period (неделя/квартал), notes, decisions.

**Settings** — wip_limit, incubation_days, success_day_rule, week_start (воскресенье).

## Правила
- **Глубина клетки** = доза относительно нормы: 0 — нет; ≥ min — 0.5; ≥ norm — 1; > norm — максимальная насыщенность. При чеклисте — доля выполненных пунктов.
- **Агрегаты** (квартал и дальше): клетка = неделя/месяц, значение = средняя глубина за дни периода.
- **Консистентность** считается только по активным периодам (пауза ротации и неактивные дни ритма не считаются пропусками).
- **«N дней без»** — для ежедневных; для периодических — «в этом периоде ещё нет». Счётчик останавливается на паузе.
- **WIP:** перевод цели в active запрещён, если число активных ≥ wip_limit, пока другая не закрыта (achieved / released).
- **Инкубация:** перевод из incubating в active не раньше incubation_days (с возможностью осознанного досрочного решения).
- **Норма finite** может рассчитываться: (target − done) / оставшиеся дни. Автоматически не повышается — только показ отставания.
- **Составные задачи:** на главном экране — одна строка; любая done/replaced запись = выполнение; глубина растёт с числом активностей. Замена плана = успех.
