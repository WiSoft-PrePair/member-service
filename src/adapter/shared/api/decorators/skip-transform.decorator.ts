import { CustomDecorator, SetMetadata } from "@nestjs/common";

export const SKIP_TRANSFORM_KEY = "skipTransform";
export const SkipTransformResponse: () => CustomDecorator = () =>
  SetMetadata(SKIP_TRANSFORM_KEY, true);
