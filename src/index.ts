import { CustomError, ICustomizedError } from './errors';

export type AnyFunction = (...args: any[]) => any;
export type AnyRecord = Record<string, any>;

const FACTORIES = {
  myService,
} as const;
type IFactories = typeof FACTORIES;
type IServiceSymbol = keyof IFactories;
type IServiceSymbolToName = {
  [key in IServiceSymbol]: IFactories[key]['meta']['name'];
};
type IServiceSymbols = {
  [key in IServiceSymbol as IServiceSymbolToName[key]]: key;
};
type IServiceName = keyof IServiceSymbols;

type IServiceFactoryToName<TFactory extends IFactories[IServiceSymbol]> = {
  [name in IServiceName]: TFactory extends IFactories[IServiceSymbols[name]] ? name : never;
}[IServiceName];

export type IInjector = <TFactoryOrName extends IFactories[IServiceSymbol] | IServiceName>(
  selector: TFactoryOrName
) => TFactoryOrName extends IFactories[IServiceSymbol]
  ? IInjectionPackage<IServiceFactoryToName<TFactoryOrName>>
  : TFactoryOrName extends IServiceName
  ? IInjectionPackage<TFactoryOrName>
  : never;

type IServiceDeps = {
  [key in IServiceName]: IFactories[IServiceSymbols[key]]['meta']['deps'];
};

type GetServiceType<TFactory extends AnyFunction> = ReturnType<TFactory> extends AnyFunction
  ? ReturnType<ReturnType<TFactory>>
  : ReturnType<TFactory>;

type IAppContainerBase = {
  [key in IServiceSymbol]: GetServiceType<IFactories[key]>;
};

export type IAppContainer = IAppContainerBase & {
  container: IAppContainer;
};

type ICustomErrorDeclarations = {
  [key in IServiceName]: IFactories[IServiceSymbols[key]]['meta'] extends { errors: any }
    ? IFactories[IServiceSymbols[key]]['meta']['errors']
    : AnyRecord;
};

type IInjectionPackage<TName extends IServiceName> = {
  [dep in IServiceDeps[TName][number]]: IAppContainer[dep];
} & {
  Error: ICustomizedError<ICustomErrorDeclarations[TName]>;
};

type IFactoryDependencySymbol = keyof IAppContainer;
interface IFactoryMetadata {
  /** Service name, usually PascalCase. Eg. MyService. This will be used to find settings and a few other thingies. */
  name: string;

  /** List of dependencies you require. This should be service symbols, camelCase. */
  deps: readonly IFactoryDependencySymbol[];

  /** Initial options for this service. If you want to provide specific types, use "as" */
  options?: AnyRecord;

  /** Definition of custom errors for this service. Basically, the second parameter to CustomError.declare() */
  errors?: Parameters<typeof CustomError['declare']>[1];
}

export function meta<TMeta extends IFactoryMetadata>(meta: TMeta) {
  return meta;
}

export function myService(inject: IInjector) {
  const { Error } = inject(myService);

  throw new Error.UnsupportedImageFormat({ format: 'abc' });
}

myService.meta = meta({
  name: 'MyService',
  deps: [],
  options: {},
  errors: {
    UnsupportedImageFormat: [400, ({ format }) => `Unsupported image format: "${format}"`],
  },
} as const);
