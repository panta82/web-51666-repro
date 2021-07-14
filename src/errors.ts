export type AnyRecord = Record<string, any>;

type IErrorStatus = 400 | 401 | 403 | 404 | 500;

type ErrorFunctionToParams<TFunction> = TFunction extends (...args: any[]) => any
  ? Parameters<TFunction>[0] extends AnyRecord
    ? Parameters<TFunction>[0]
    : never
  : never;
type ErrorDeclarationToParams<TDeclaration> = TDeclaration extends readonly any[]
  ? ErrorFunctionToParams<TDeclaration[1]>
  : ErrorFunctionToParams<TDeclaration>;

interface ICustomErrorStaticInterface<TParams> {
  guard(params: TParams): <T>(val: T) => T;
}

type ICustomErrorCtr<TDeclaration> = ErrorDeclarationToParams<TDeclaration> extends never
  ? (new (innerError?: Error) => CustomError) & ICustomErrorStaticInterface<void>
  : (new (params: ErrorDeclarationToParams<TDeclaration>, innerError?: Error) => CustomError &
      ErrorDeclarationToParams<TDeclaration>) &
      ICustomErrorStaticInterface<ErrorDeclarationToParams<TDeclaration>>;

export type ICustomizedError<TErrors> = {
  [name in keyof TErrors]: ICustomErrorCtr<TErrors[name]>;
} &
  (new (message: string, innerError?: Error) => CustomError);

interface ICustomErrorMetadata {
  name: string;
  status: IErrorStatus;
  constructor: ICustomErrorCtr<any>;
}

export class CustomError extends Error {
  /** Error name, derived from constructor. This is the primary distinguishing characteristic between errors */
  public name: string;

  /** Status code, roughly matches HTTP status codes */
  public status: IErrorStatus;

  /** Error that has caused this error to appear */
  public inner_error: Error;

  constructor(message: string, status?: IErrorStatus);
  constructor(message: string, innerError: Error, status?: IErrorStatus);
  constructor(message: string, innerErrorOrStatus?: IErrorStatus | Error, status?: IErrorStatus) {
    let innerError = null;
    if (innerErrorOrStatus && typeof innerErrorOrStatus !== 'number') {
      // Treat as inner error
      innerError = innerErrorOrStatus;
    } else if (status === undefined) {
      // Treat as status
      status = innerErrorOrStatus as IErrorStatus;
    }

    // Fix typescript custom Error prototype chain
    // https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
    // https://github.com/reduardo7/ts-base-error/blob/master/src/index.ts
    const trueProto = new.target.prototype;

    super(message);

    Object.setPrototypeOf(this, trueProto);

    // Make message and stack appear when error is JSON-ified
    Object.defineProperties(this, {
      message: { enumerable: true, writable: true },
      stack: { enumerable: true, writable: true },
    });

    if (innerError) {
      this.inner_error = innerError;
      // Make sure inner error can also be serialized to JSON
      Object.defineProperties(this.inner_error, {
        message: { enumerable: true, writable: true },
        stack: { enumerable: true, writable: true },
      });
    }

    this.status = status;
    this.name = this.constructor.name;

    // Extend stack trace
    if (this.inner_error && this.inner_error.stack) {
      this.stack +=
        '\n    ================================================================================\n' +
        this.inner_error.stack
          .split('\n')
          .map(line => '    ' + line)
          .join('\n');
    }
  }

  static errors: { [key: string]: ICustomErrorMetadata } = {};

  static register(ctr: ICustomErrorCtr<any>, status: IErrorStatus = 500, name?: string) {
    name = name || ctr['name'];
    if (this.errors[name]) {
      throw new CustomError(`Error "${name}" has already been declared`, 500);
    }
    this.errors[name] = {
      name,
      status,
      constructor: ctr,
    };
  }

  // *********************************
  // START ICustomErrorStaticInterface

  static guard(params) {
    return value => {
      if (!value) {
        throw new this(params);
      }
      return value;
    };
  }

  // END ICustomErrorStaticInterface
  // *********************************

  // TODO: For some reason TParams & CustomError doesn't include props from TParams. Since this is kind
  //       of marginal use case, let's leave it like that for now. But it's strange.
  static declareError<TParams extends AnyRecord>(
    name: string,
    status: IErrorStatus,
    message: string | ((params: TParams) => string)
  ): new (params: TParams, innerError?: Error) => TParams & CustomError {
    const hasParams = typeof message === 'string' ? false : message.length > 0;
    const makeMessage = typeof message === 'string' ? () => message : message;
    const scaffold = {
      [name]: class extends CustomError {
        constructor(params, innerError) {
          const message = makeMessage(params);
          if (!hasParams) {
            innerError = params;
            params = null;
          }
          super(message, innerError, status);

          if (params && typeof params === 'object') {
            for (const key in params) {
              if (
                Object.prototype.hasOwnProperty.call(params, key) &&
                key !== 'message' &&
                key !== 'status' &&
                key !== 'inner_error' &&
                key !== 'name'
              ) {
                this[key] = params[key];
              }
            }
          }
        }
      },
    };
    const errorCtr = scaffold[name] as any;
    this.register(errorCtr, status, name);
    return errorCtr;
  }

  static declare<
    TErrors extends {
      [name: string]:
        | string
        | ((params) => string)
        | readonly [IErrorStatus, string]
        | readonly [IErrorStatus, (params) => string];
    }
  >(
    prefix: string | ((...args: any[]) => any) | (new (...args: any[]) => any),
    errors: TErrors
  ): ICustomizedError<TErrors> {
    const prefixString = typeof prefix === 'function' ? prefix.name : prefix;
    const result = CustomError.declareError(
      prefixString,
      500,
      message => message as any as string
    ) as any;
    for (const name in errors) {
      if (name.endsWith('Error')) {
        throw new MetaError.UnneededSuffix({ target_name: name });
      }

      const specifier = errors[name];
      const errorName = `${prefixString}_${name}Error`;
      if (Array.isArray(specifier)) {
        result[name] = CustomError.declareError(errorName, specifier[0], specifier[1]);
      } else {
        result[name] = CustomError.declareError(errorName, 500, specifier as any);
      }
    }
    return result;
  }
}

const MetaError = CustomError.declare(CustomError, {
  UnneededSuffix: ({ targetName }) =>
    `There is no need to end CustomError declaration for "${targetName}" names with "Error". The suffix will be appended automatically`,
});
