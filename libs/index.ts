import { NestApplicationOptions, INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { Server } from 'http'
import { ExpressAdapter } from '@nestjs/platform-express'
import * as serverless from 'aws-serverless-express'
import express, { Response, NextFunction } from 'express'
import 'reflect-metadata'
import { Context } from 'aws-lambda'

let cachedServer: Server

export type NestAplicationCallback = (
  app: INestApplication,
) => INestApplication | Promise<INestApplication>;
const defaultCallback: NestAplicationCallback = app => app

export interface NestApplicationServerlessOptions extends NestApplicationOptions {
  rawBody?: boolean
}
/**
 * Wrapper class for Nestjs in AWS Lambda
 */
export class ServerlessNestjsApplicationFactory<T = any> {
  private readonly AppModule: T;
  private options: NestApplicationServerlessOptions;
  // private expressOptions:
  private callback: NestAplicationCallback;
  constructor (
    AppModule: T,
    options: NestApplicationServerlessOptions = {},
    callback: NestAplicationCallback = defaultCallback
  ) {
    this.AppModule = AppModule
    this.options = options
    this.callback = callback
  }

  /**
   * Update your nest application options
   * @param options
   */
  public updateOptions (options: NestApplicationServerlessOptions) {
    this.options = options
    return this
  }

  /**
   * Update callback to execute nest application
   * @param callback
   * @example
   * ```
   * const application = new ServerlessNestjsApplicationFactory(AppModule)
   * application.updateCallback(app => {
   *   app.enableCors()
   * })
   * return applicaiton.run(event, context)
   * ```
   */
  public updateCallback (callback: NestAplicationCallback) {
    this.callback = callback
    return this
  }

  /**
   * Just create nest js application wrapped by Express Adapter
   */
  public async createApplication () {
    const expressApp = express()
    if (this.options.rawBody) {
      expressApp.use(function (req: any, _res: Response, next: NextFunction) {
        let data = ''
        req.setEncoding('utf8')
        req.on('data', function (chunk: any) {
          data += chunk
        })
        req.on('end', function () {
          req.rawBody = data
          next()
        })
      })
    }

    const adapter = new ExpressAdapter(expressApp)
    const options: NestApplicationOptions = this.options
    const application = await NestFactory.create(
      this.AppModule,
      adapter,
      options
    )
    const app = await this.callback(application)
    app.init()
    return serverless.createServer(expressApp)
  }

  /**
   * Start Nestjs application in AWS Lambda
   * @param event
   * @param context
   */
  public async run (
    event: any,
    context: Context
  ) {
    if (!cachedServer) {
      cachedServer = await this.createApplication()
    }
    const result = await serverless.proxy(
      cachedServer,
      event,
      context,
      'PROMISE'
    ).promise
    return result
  }
}
