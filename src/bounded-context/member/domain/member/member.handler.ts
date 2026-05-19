import { Notification } from "@/bounded-context/member/domain/member/enums";
import { NotificationFrequency } from "./enums/frequency.enum";
import {
  MemberEmailChangedEvent,
  MemberPasswordChangedEvent,
  MemberPasswordResetEvent,
  MemberPointAddedEvent,
  MemberRegisteredEvent,
  MemberUpdatedEvent,
  MemberWithdrawnEvent,
} from "./events";
import type { MemberSnapshot } from "./member.snapshot";

export type MemberEventType =
  | typeof MemberRegisteredEvent.TYPE
  | typeof MemberUpdatedEvent.TYPE
  | typeof MemberPasswordChangedEvent.TYPE
  | typeof MemberPasswordResetEvent.TYPE
  | typeof MemberEmailChangedEvent.TYPE
  | typeof MemberPointAddedEvent.TYPE
  | typeof MemberWithdrawnEvent.TYPE;

export type MemberState = MemberSnapshot;

export const INITIAL_MEMBER_STATE: MemberState = {
  id: "",
  email: "",
  hashedPassword: "",
  nickname: "",
  job: "",
  notification: Notification.EMAIL,
  frequency: NotificationFrequency.WEEKLY,
  point: 0,
  isPro: false,
  isWithdrawn: false,
};

const replacePassword = (
  s: MemberState,
  e: MemberPasswordChangedEvent | MemberPasswordResetEvent,
): void => {
  s.hashedPassword = e.payload.hashedPassword;
};

export const memberEventHandlers = {
  [MemberRegisteredEvent.TYPE]: (s: MemberState, e: MemberRegisteredEvent) => {
    s.id = e.aggregateId;
    s.email = e.payload.email;
    s.hashedPassword = e.payload.hashedPassword;
    s.nickname = e.payload.nickname;
    s.job = e.payload.job;
    s.notification = e.payload.notification;
    s.frequency = e.payload.frequency;
    s.point = 0;
    s.isPro = false;
    s.isWithdrawn = false;
  },
  [MemberUpdatedEvent.TYPE]: (s: MemberState, e: MemberUpdatedEvent) => {
    if (e.payload.job !== undefined) s.job = e.payload.job;
    if (e.payload.nickname !== undefined) s.nickname = e.payload.nickname;
    if (e.payload.notification !== undefined)
      s.notification = e.payload.notification;
    if (e.payload.frequency !== undefined) s.frequency = e.payload.frequency;
  },
  [MemberPasswordChangedEvent.TYPE]: replacePassword,
  [MemberPasswordResetEvent.TYPE]: replacePassword,
  [MemberEmailChangedEvent.TYPE]: (
    s: MemberState,
    e: MemberEmailChangedEvent,
  ) => {
    s.email = e.payload.newEmail;
  },
  [MemberPointAddedEvent.TYPE]: (s: MemberState, e: MemberPointAddedEvent) => {
    s.point += e.payload.point;
  },
  [MemberWithdrawnEvent.TYPE]: (s: MemberState) => {
    s.isWithdrawn = true;
  },
} satisfies Record<MemberEventType, (s: MemberState, e: any) => void>;
