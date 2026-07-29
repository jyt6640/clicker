-- 이관이 건너뛴 회차를 복구합니다. SQL Editor에 붙여넣고 실행하세요.
--
-- 이관 도구는 이미 있는 회차를 건드리지 않습니다. 그 사이 새 백엔드에서
-- 게임이 실제로 돌아가 cylinder-r1 / button-r1 이 이미 만들어져 있었고,
-- 그래서 Firestore의 진짜 기록(원통 93명)이 들어가지 못했습니다.
--
-- 새로 쌓인 것도 지우지 않습니다. 2회차로 옮겨 보존하고, 그 자리에
-- Firestore 원본을 1회차로 넣습니다.

begin;

-- 검증용으로 만들었던 회차 제거
delete from public.games where id = 'selftest-r1';

-- cylinder: 새 백엔드에 쌓인 것을 2회차로 옮깁니다
insert into public.games (id, status, target, start_time, end_time, milestones, hint_level, last_press, last_presser, winner)
  select 'cylinder-r2', status, target, start_time, end_time, milestones, hint_level, last_press, last_presser, winner
    from public.games where id = 'cylinder-r1' on conflict (id) do nothing;
update public.counters     set game_id = 'cylinder-r2' where game_id = 'cylinder-r1';
update public.participants set game_id = 'cylinder-r2' where game_id = 'cylinder-r1';
delete from public.games where id = 'cylinder-r1';

-- button: 새 백엔드에 쌓인 것을 2회차로 옮깁니다
insert into public.games (id, status, target, start_time, end_time, milestones, hint_level, last_press, last_presser, winner)
  select 'button-r2', status, target, start_time, end_time, milestones, hint_level, last_press, last_presser, winner
    from public.games where id = 'button-r1' on conflict (id) do nothing;
update public.counters     set game_id = 'button-r2' where game_id = 'button-r1';
update public.participants set game_id = 'button-r2' where game_id = 'button-r1';
delete from public.games where id = 'button-r1';

-- cylinder-r1: Firestore 원본 (합계 20,000, 참여자 93명)
insert into public.games (id, status, target, start_time, end_time, milestones, hint_level, last_press, last_presser, winner) values (
  'cylinder-r1', 'completed', 20000, '2026-07-28T07:05:52.431000+00', '2026-07-28T07:12:38.060000+00', '{"25": "2026-07-28T07:09:33.512000+00", "50": "2026-07-28T07:11:27.029000+00", "75": "2026-07-28T07:11:55.762000+00", "100": "2026-07-28T07:12:38.058000+00"}'::jsonb, 0, null, null, null);
insert into public.counters (game_id, bucket, value) values ('cylinder-r1', 'main', 20000) on conflict (game_id, bucket) do update set value = excluded.value;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '13EoPhcLizM8MCk3jO44BvoTogG2', 1138, '2026-07-28T07:06:03.333000+00', '2026-07-28T07:06:05.392000+00', '2026-07-28T07:12:37.903000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '1MmHiSXsc0Vs4QuEWdVVN0T9lKA3', 0, '2026-07-28T07:12:38.903000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '1ktDpWxjmjhWqypLxmjdmqPFKl02', 0, '2026-07-28T07:07:07.634000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '28WWBBJdMBOe6EanI5maTIHQn292', 39, '2026-07-28T07:06:31.407000+00', '2026-07-28T07:06:33.467000+00', '2026-07-28T07:06:38.467000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '3R1Ix6maKQPHHx1eGfpKlHeHvAh1', 0, '2026-07-28T07:06:06.415000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '3bNYTVg1hIfHhnWpVQ8nLXo3PFy1', 19, '2026-07-28T07:07:44.113000+00', '2026-07-28T07:07:47.677000+00', '2026-07-28T07:08:04.463000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '4el434QZEQWOyzbxducoKruZxef2', 335, '2026-07-28T07:07:56.069000+00', null, '2026-07-28T07:12:37.632000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '4r94JxLf7lbLiyjLbRwF8ycgOLO2', 0, '2026-07-28T07:44:19.219000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '4tGBHPADnTbZZP0g6Goj40vDYAh1', 0, '2026-07-28T07:10:22.205000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '73D63IilmDYRXR1TPY51RWOXjkC3', 0, '2026-07-28T07:42:01.016000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '73ZTEZNsE2XKjHQuGypAsEywlmx1', 98, '2026-07-28T07:07:49.237000+00', '2026-07-28T07:07:50.298000+00', '2026-07-28T07:08:32.298000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '7EpwKFcizeSAO1fasJUA2IJ054V2', 0, '2026-07-28T07:28:45.033000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '7lreblEXejSm83TKhVXy5Eod2S03', 0, '2026-07-28T07:05:52.332000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '8S563rdyosSf49oYL3nAJUbf2yV2', 16, '2026-07-28T07:07:09.563000+00', '2026-07-28T07:07:11.128000+00', '2026-07-28T07:07:14.628000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '942VA07t3iUoIfN2iwQC9DtJqWs2', 5, '2026-07-28T07:09:42.092000+00', '2026-07-28T07:09:43.655000+00', '2026-07-28T07:09:47.655000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '9PdtVCiNrDZA9M23gvz6U2t6qPs2', 34, '2026-07-28T07:07:15.581000+00', '2026-07-28T07:07:20.446000+00', '2026-07-28T07:07:28.446000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', '9cWTRRI9hOdaaiiIEhrtZFsUGG12', 13528, '2026-07-28T07:07:06.323000+00', '2026-07-28T07:07:07.383000+00', '2026-07-28T07:12:38.005000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'ABIRW5WWDpRdlOURNDCUpyyZ0XC3', 28, '2026-07-28T07:07:06.853000+00', '2026-07-28T07:07:08.410000+00', '2026-07-28T07:07:13.411000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'ArWoaYzPfAfMFtjKJxzCEq6zrhj1', 0, '2026-07-28T09:11:04.042000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'B39Mz4MKPSbMDiLgKpHBgW3eoYI2', 0, '2026-07-28T08:47:22.675000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'BzwoAOle4tXDi0t1lFPrrEsRi4I2', 0, '2026-07-28T07:28:45.160000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'C2K98cOzcsdOsqu2l8yJ4plVsVP2', 0, '2026-07-28T07:09:14.016000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'CCI2h4WOUwYk1tj8NtCJ4YvxID52', 153, '2026-07-28T07:05:55.555000+00', '2026-07-28T07:05:57.628000+00', '2026-07-28T07:12:37.108000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'CEn5MJevTnbx09dqXKnEsdbaiVh2', 153, '2026-07-28T07:08:05.705000+00', '2026-07-28T07:08:16.772000+00', '2026-07-28T07:08:55.771000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'CXWxVAM2X3YafJe2HDjd0eLtrFs1', 0, '2026-07-28T07:07:09.750000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'DITaM7hXwkYhNSWCDFf6nzPzyDF3', 3, '2026-07-28T07:08:14.392000+00', '2026-07-28T07:08:15.944000+00', '2026-07-28T07:08:16.944000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'DRTV012yLJXBCWEPuPYThSo2gD33', 0, '2026-07-29T02:59:02.322000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'E0BACBsFpEcvvIVG2NTFyeJAPnv1', 26, '2026-07-28T07:08:11.151000+00', '2026-07-28T07:08:18.205000+00', '2026-07-28T07:08:24.199000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'FCC9Y8imkGVzLBG9AxoYwh0Vv8o1', 0, '2026-07-28T07:07:34.536000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'FXm4feaAlTWpwKitAj3LP3Hssfh2', 0, '2026-07-29T05:37:44.296000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'GAEKIj6l0NUuEiOdi4Qyj85vqFm1', 0, '2026-07-28T07:09:57.501000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'GJb4qyHVXGd2Sgl0ni7ZaNzymwt1', 0, '2026-07-28T07:09:42.507000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'GTpFPPeyo9Qkm0STzyItgLXTVyE2', 0, '2026-07-28T10:34:37.961000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'IwVVc3w5tphNyscpg0TFuP1wE743', 7, '2026-07-28T07:08:31.186000+00', '2026-07-28T07:08:33.250000+00', '2026-07-28T07:08:34.749000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'J554vUIkzmbTi9HdxWBZsc8ovRE3', 5, '2026-07-28T07:05:52.221000+00', '2026-07-28T07:05:54.302000+00', '2026-07-28T07:05:55.302000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'JC2bbddGlWdiQ30nwPTc8fqh4Mq1', 0, '2026-07-28T07:16:00.205000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'KAKyY81ToBQ6Ud4yn3wifbXeX0g1', 0, '2026-07-29T06:07:11.355000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'L4dxwTGROFQDUTJ6d9OxWIsw3GH2', 0, '2026-07-28T07:44:07.202000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'LGUR2J4sYqX7JA0DgN3KnHKSuak2', 10, '2026-07-28T07:07:12.375000+00', '2026-07-28T07:07:13.465000+00', '2026-07-28T07:07:18.963000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'Lcdav5ZonUVs5LvBuPX2kMIH5RD3', 0, '2026-07-28T07:06:01.840000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'M0XZAD2QvDOh3hUcuaeFy40NZ8h2', 4, '2026-07-28T07:06:25.395000+00', '2026-07-28T07:06:28.955000+00', '2026-07-28T07:06:30.455000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'OIaFuY9zpjevh8Pwj5Fg1Ps53Rz2', 0, '2026-07-28T09:02:02.553000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'Ocn2OJMclsZNiHh3nDRBACeOXTp2', 18, '2026-07-28T07:07:30.291000+00', '2026-07-28T07:07:32.852000+00', '2026-07-28T07:07:43.352000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'PxtEQHEprOSCbuuQLfwU9xhdgAq1', 0, '2026-07-28T07:06:16.424000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'QUwdlugJqXX36ayzz9B6LAlL4X22', 37, '2026-07-28T07:06:54.148000+00', '2026-07-28T07:06:55.221000+00', '2026-07-28T07:07:07.721000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'RcB5qaDYfpWRXyPStLZbP54ewzE3', 0, '2026-07-28T07:09:21.375000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'TAlzqCeg9dcqDzVDJnSny2KiCCn2', 37, '2026-07-28T07:07:13.736000+00', '2026-07-28T07:07:18.785000+00', '2026-07-28T07:07:24.785000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'UQNi9XA1nkeWyNVP4sXzIHBEvYh2', 0, '2026-07-28T09:30:03.085000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'UUjIipTFNDXCxWmbDk7SwmVsGg42', 0, '2026-07-28T07:42:55.798000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'Ubd6g2vb7Se7MwgH9FOjLsa4IUi1', 0, '2026-07-29T06:00:20.204000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'VC59rtzSaBcjE966z2unhubPb2K2', 96, '2026-07-28T07:06:04.849000+00', '2026-07-28T07:06:06.909000+00', '2026-07-28T07:12:33.119000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'WKBjQv2dUYPCv0mLT4MDWw8pkRU2', 1097, '2026-07-28T07:06:03.465000+00', '2026-07-28T07:06:04.527000+00', '2026-07-28T07:11:20.517000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'WTzzGD0erDYgbxvFt2x0htHGqPa2', 124, '2026-07-28T07:05:58.998000+00', '2026-07-28T07:06:01.403000+00', '2026-07-28T07:06:15.904000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'WUHObD9KxubReUM5Mf9gWwlrCf82', 52, '2026-07-28T07:10:41.359000+00', '2026-07-28T07:10:42.439000+00', '2026-07-28T07:10:52.438000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'YiEwktwLCGU10HuLxKRjr6hwtor1', 20, '2026-07-28T07:11:10.658000+00', '2026-07-28T07:11:13.249000+00', '2026-07-28T07:11:17.246000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'YtjK3OdSUUSR1gQruU419DbyUfg2', 199, '2026-07-28T07:08:27.719000+00', '2026-07-28T07:08:29.288000+00', '2026-07-28T07:12:37.785000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'aonc6UI0cvgQmkSyAE3rBmTwrwY2', 0, '2026-07-28T07:06:14.377000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'c3kawGu1stMmJW5yosuASUg4PSS2', 0, '2026-07-28T07:07:35.833000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'cOYEP2P3vld1csDGpbp5foC30vy2', 0, '2026-07-28T07:07:16.029000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'cv9x5B1GQfU1Zx48xdXfzJe66CQ2', 11, '2026-07-28T07:07:34.178000+00', '2026-07-28T07:07:44.727000+00', '2026-07-28T07:11:41.018000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'd9kxk2Df0cddwx6nRaXpCOkBb6l2', 41, '2026-07-28T07:05:55.728000+00', '2026-07-28T07:05:58.416000+00', '2026-07-28T07:06:03.417000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'dtT0RcaJBybsI8J5dOPquJZrRLh2', 0, '2026-07-29T05:49:26.605000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'ewezWUl4keM2RAmMeJ7ycDzbXC82', 215, '2026-07-28T07:06:20.618000+00', '2026-07-28T07:06:23.186000+00', '2026-07-28T07:07:10.185000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'f0XlND9XTogpAXmFg0tB9c70vjv1', 0, '2026-07-28T07:34:38.333000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'gkWQowayh5NhWF3toiXI2FHIm0A2', 0, '2026-07-28T07:58:40.026000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'hgQ4TUXl1GTZJMjcsufMoRwdUKR2', 261, '2026-07-28T07:05:52.321000+00', '2026-07-28T07:05:53.394000+00', '2026-07-28T07:11:00.031000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'hqGbc56h5zUYPRqWXI26gQtoXBz2', 0, '2026-07-28T07:07:07.195000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'j9s1CkyNrmYb2gLWScS4JtuPBCA2', 6, '2026-07-28T07:09:59.129000+00', '2026-07-28T07:10:00.685000+00', '2026-07-28T07:10:01.685000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'lELOo7kBprWYsRlCBGIwpJ49keX2', 0, '2026-07-29T06:14:20.240000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'p1K5PpECLggcSjRzjmhTJ9xw1Pk1', 0, '2026-07-28T21:09:21.617000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'qGZtMIaSVNOHoPDxrBeLbnglbtv2', 0, '2026-07-28T18:03:22.064000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'qwbTL1FJxFcuwLRfififVCHK53W2', 0, '2026-07-28T07:06:30.957000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'raP3S0j5wnMu3VfHKYiDTsUtYyQ2', 0, '2026-07-29T05:39:20.933000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'rypxff28FIbMiGkuiuRgaaXFwk93', 186, '2026-07-28T07:06:16.017000+00', '2026-07-28T07:06:19.835000+00', '2026-07-28T07:07:06.385000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'sUEWuHmxA6YmRQ5B2Bz8n30rZSI2', 86, '2026-07-28T07:11:23.040000+00', '2026-07-28T07:11:24.783000+00', '2026-07-28T07:11:49.783000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'syJxUZWOVzOyiM4AyVX64YeIitZ2', 0, '2026-07-28T07:07:06.786000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'ur4NCCDCYaeO5Ea1MH23P53t9Wg1', 0, '2026-07-28T07:05:53.110000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'uronAlOqb7c3px2OUJPxcKSnZVW2', 0, '2026-07-28T07:06:09.805000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'usl0lqa403W8Pjbuk1xWGjs92k93', 0, '2026-07-28T07:23:27.569000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'vKc80rYlcWZWPUzjnMpZ2rmWZ0D3', 9, '2026-07-28T07:11:25.479000+00', '2026-07-28T07:11:29.547000+00', '2026-07-28T07:11:31.047000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'vO28yLRgG2MEF59lqSG5mdxNKLI2', 0, '2026-07-28T08:21:02.132000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'viepNaumdoN11bnFP0hV0tBFC5z1', 0, '2026-07-28T07:11:52.453000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'wAuf7vS3u0cQZiPmdB9PIsdmTUk2', 1, '2026-07-28T07:08:22.336000+00', '2026-07-28T07:08:25.223000+00', '2026-07-28T07:08:25.223000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'wStvjC9TuZeElPOmKFX9ZrXMBnp2', 0, '2026-07-28T07:08:33.053000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'wedkHkpGN8b6FugYbXyBJOSjkJi1', 59, '2026-07-28T07:06:10.658000+00', '2026-07-28T07:06:12.219000+00', '2026-07-28T07:06:34.649000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'wo75Eb6fL5P1d6aaijRm4MqBbe42', 0, '2026-07-29T05:48:54.675000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'wqDnDFJkRBQbIcyJiWYZEeKqTOu2', 0, '2026-07-28T07:10:45.031000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'xTdBVrwCj7UgEYurrUByGdsOgIg1', 882, '2026-07-28T07:06:14.330000+00', '2026-07-28T07:06:15.105000+00', '2026-07-28T07:08:29.605000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'yZcuRb45pSTnNWm9zHDW8KhkkQq1', 121, '2026-07-28T07:12:13.575000+00', '2026-07-28T07:12:15.136000+00', '2026-07-28T07:12:37.636000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'yhZ5BDuAYvUqBpcNb5kELF3O1WI2', 0, '2026-07-29T06:00:17.089000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'z4ch028UdRTW25jUdnfjCjvnB3k1', 0, '2026-07-28T07:06:16.717000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'znTmzwr6brRMr8lbYex3BDHQPV23', 0, '2026-07-28T07:39:30.255000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('cylinder-r1', 'zq2aVqJ8SFemjgdsZlSlSgOF57d2', 5, '2026-07-28T07:08:38.716000+00', '2026-07-28T07:09:53.604000+00', '2026-07-28T07:09:55.102000+00') on conflict (game_id, uid) do nothing;

-- button-r1: Firestore 원본 (합계 1, 참여자 8명)
insert into public.games (id, status, target, start_time, end_time, milestones, hint_level, last_press, last_presser, winner) values (
  'button-r1', 'completed', null, '2026-07-29T05:42:30.971000+00', '2026-07-29T06:01:09.144000+00', '{}'::jsonb, 0, '2026-07-29T05:42:40.831000+00', 'fizlceSEeZgKXvPVGVpqjeTFs8e2', 'fizlceSEeZgKXvPVGVpqjeTFs8e2');
insert into public.counters (game_id, bucket, value) values ('button-r1', 'main', 1) on conflict (game_id, bucket) do update set value = excluded.value;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('button-r1', '7Kph0xvVazciTx2fDO2eltAyTsJ3', 0, '2026-07-29T06:09:34.992000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('button-r1', 'CEn5MJevTnbx09dqXKnEsdbaiVh2', 0, '2026-07-29T06:08:27.921000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('button-r1', 'YiEwktwLCGU10HuLxKRjr6hwtor1', 0, '2026-07-29T06:09:31.075000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('button-r1', 'fizlceSEeZgKXvPVGVpqjeTFs8e2', 1, '2026-07-29T05:42:30.679000+00', '2026-07-29T05:42:41.243000+00', '2026-07-29T05:42:41.243000+00') on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('button-r1', 'j9s1CkyNrmYb2gLWScS4JtuPBCA2', 0, '2026-07-29T06:27:00.644000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('button-r1', 'rgVTbw9PxMcX6udhCK30IjGfADH3', 0, '2026-07-29T06:27:14.706000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('button-r1', 'v21UcGFxH4YvpMuIoAm20YFrZOx1', 0, '2026-07-29T06:19:44.734000+00', null, null) on conflict (game_id, uid) do nothing;
insert into public.participants (game_id, uid, count, first_visit, first_action, last_action) values ('button-r1', 'yhZ5BDuAYvUqBpcNb5kELF3O1WI2', 0, '2026-07-29T06:01:08.975000+00', null, null) on conflict (game_id, uid) do nothing;

-- 새 참여는 2회차로 가도록 현재 회차를 올립니다.
insert into public.settings (key, value) values ('games',
  '{"cylinder":{"round":2},"button":{"round":2},"melt":{"round":1},"lock":{"round":1},"tug":{"round":1}}'::jsonb)
  on conflict (key) do update set value = public.settings.value || excluded.value;

commit;
