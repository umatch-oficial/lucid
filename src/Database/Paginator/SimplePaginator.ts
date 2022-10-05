/*
 * @adonisjs/lucid
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { stringify } from 'qs'
import { SimplePaginatorContract, SimplePaginatorMetaKeys } from '@ioc:Adonis/Lucid/Database'

import { SnakeCaseNamingStrategy } from '../../Orm/NamingStrategies/SnakeCase'

/**
 * Simple paginator works with the data set provided by the standard
 * `offset` and `limit` based pagination.
 */
export class SimplePaginator extends Array implements SimplePaginatorContract<any> {
  private qs: { [key: string]: any } = {}
  private url: string = '/'
  private rows: any[]

  /**
   * Naming strategy for the pagination meta keys
   */
  public static namingStrategy: {
    paginationMetaKeys(): SimplePaginatorMetaKeys
  } = new SnakeCaseNamingStrategy()

  /**
   * Can be defined at per instance level as well
   */
  public namingStrategy = SimplePaginator.namingStrategy

  /**
   * The first page is always 1
   */
  public readonly firstPage: number = 1

  /**
   * Find whether result set is empty
   */
  public readonly isEmpty: boolean

  /**
   * Casting `total` to a number. Later, we can think of situations
   * to cast it to a bigint
   */
  public readonly total = Number(this.totalNumber)

  /**
   * Find whether there are total records. This is not same as
   * `isEmpty`.
   *
   * The `isEmpty` reports about the current set of results. `hasTotal`,
   * on the other hand, reports about the total number of records,
   * regardless of the current.
   */
  public readonly hasTotal: boolean = this.total > 0

  /**
   * The Last page number
   */
  public readonly lastPage: number = Math.max(Math.ceil(this.total / this.perPage), 1)

  /**
   * Find if there are more pages to come
   */
  public readonly hasMorePages: boolean = this.lastPage > this.currentPage

  /**
   * Find whether there are enough results to be paginated
   */
  public readonly hasPages: boolean = this.lastPage !== 1

  constructor(
    private totalNumber: number,
    public readonly perPage: number,
    public readonly currentPage: number,
    ...rows: any[]
  ) {
    super(...rows)
    this.rows = rows
    this.isEmpty = this.rows.length === 0
  }

  /**
   * A reference to the result rows
   */
  public all() {
    return this.rows
  }

  /**
   * Returns JSON meta data
   */
  public getMeta(): any {
    const metaKeys = this.namingStrategy.paginationMetaKeys()

    return {
      [metaKeys.total]: this.total,
      [metaKeys.perPage]: this.perPage,
      [metaKeys.currentPage]: this.currentPage,
      [metaKeys.lastPage]: this.lastPage,
      [metaKeys.firstPage]: this.firstPage,
      [metaKeys.firstPageUrl]: this.getUrl(1),
      [metaKeys.lastPageUrl]: this.getUrl(this.lastPage),
      [metaKeys.nextPageUrl]: this.getNextPageUrl(),
      [metaKeys.previousPageUrl]: this.getPreviousPageUrl(),
    }
  }

  /**
   * Returns JSON representation of the paginated
   * data
   */
  public toJSON() {
    return {
      meta: this.getMeta(),
      data: this.all(),
    }
  }

  /**
   * Define query string to be appended to the pagination links
   */
  public queryString(values: { [key: string]: any }): this {
    this.qs = values
    return this
  }

  /**
   * Define base url for making the pagination links
   */
  public baseUrl(url: string): this {
    this.url = url
    return this
  }

  /**
   * Returns url for a given page. Doesn't validate the integrity of the
   * page
   */
  public getUrl(page: number): string {
    const qs = stringify(Object.assign({}, this.qs, { page: page < 1 ? 1 : page }))
    return `${this.url}?${qs}`
  }

  /**
   * Returns url for the next page
   */
  public getNextPageUrl(): string | null {
    if (this.hasMorePages) {
      return this.getUrl(this.currentPage + 1)
    }
    return null
  }

  /**
   * Returns URL for the previous page
   */
  public getPreviousPageUrl(): string | null {
    if (this.currentPage > 1) {
      return this.getUrl(this.currentPage - 1)
    }

    return null
  }

  /**
   * Returns an array of urls under a given range
   */
  public getUrlsForRange(start: number, end: number) {
    let urls: { url: string; page: number; isActive: boolean }[] = []
    for (let i = start; i <= end; i++) {
      urls.push({ url: this.getUrl(i), page: i, isActive: i === this.currentPage })
    }

    return urls
  }
}
