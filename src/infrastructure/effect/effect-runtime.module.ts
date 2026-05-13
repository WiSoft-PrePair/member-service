import {
  Global,
  Injectable,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common";
import { Layer, ManagedRuntime } from "effect";

export const EFFECT_RUNTIME = Symbol("EffectRuntime");

export const AppLayer = Layer.empty;

export type AppRuntime = ManagedRuntime.ManagedRuntime<
  Layer.Layer.Success<typeof AppLayer>,
  never
>;

@Injectable()
export class EffectRuntimeProvider implements OnApplicationShutdown {
  readonly runtime: AppRuntime = ManagedRuntime.make(AppLayer);

  async onApplicationShutdown() {
    await this.runtime.dispose();
  }
}

@Global()
@Module({
  providers: [
    EffectRuntimeProvider,
    {
      provide: EFFECT_RUNTIME,
      useFactory: (p: EffectRuntimeProvider) => p.runtime,
      inject: [EffectRuntimeProvider],
    },
  ],
  exports: [EFFECT_RUNTIME],
})
export class EffectRuntimeModule {}
