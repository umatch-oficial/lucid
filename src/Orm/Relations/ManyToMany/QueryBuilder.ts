/*
 * @adonisjs/lucid
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Knex } from 'knex'
import { DateTime } from 'luxon'
import { QueryClientContract } from '@ioc:Adonis/Lucid/Database'
import { LucidModel, LucidRow, ManyToManyQueryBuilderContract } from '@ioc:Adonis/Lucid/Orm'

import { ManyToMany } from './index'
import { PivotHelpers } from './PivotHelpers'
import { getValue, unique } from '../../../utils'
import { BaseQueryBuilder } from '../Base/QueryBuilder'

/**
 * Extends the model query builder for executing queries in scope
 * to the current relationship
 */
export class ManyToManyQueryBuilder
  extends BaseQueryBuilder
  implements ManyToManyQueryBuilderContract<LucidModel, LucidModel>
{
  private pivotQuery = false
  private relatedTable = this.relation.relatedModel().table
  private pivotHelpers = new PivotHelpers(this, true)

  protected cherryPickingKeys: boolean = false
  protected appliedConstraints: boolean = false

  /**
   * A boolean to know whether query build targets only the
   * pivot table
   */
  public get isPivotOnlyQuery() {
    return this.pivotQuery
  }
  public set isPivotOnlyQuery(pivotOnly) {
    this.pivotQuery = pivotOnly

    /**
     * Get plain object for a pivot only query
     */
    if (this.pivotQuery) {
      this.pojo()
    }
  }

  constructor(
    builder: Knex.QueryBuilder,
    client: QueryClientContract,
    private parent: LucidRow | LucidRow[],
    public relation: ManyToMany
  ) {
    super(builder, client, relation, (userFn) => {
      return ($builder) => {
        const subQuery = new ManyToManyQueryBuilder(
          $builder,
          this.client,
          this.parent,
          this.relation
        )
        subQuery.isChildQuery = true
        subQuery.isPivotOnlyQuery = this.isPivotOnlyQuery
        subQuery.isRelatedPreloadQuery = this.isRelatedPreloadQuery
        userFn(subQuery)
        subQuery.applyWhere()
      }
    })
  }

  /**
   * Profiler data for ManyToMany relationship
   */
  protected profilerData() {
    return {
      type: this.relation.type,
      model: this.relation.model.name,
      pivotTable: this.relation.pivotTable,
      relatedModel: this.relation.relatedModel().name,
    }
  }

  /**
   * The keys for constructing the join query
   */
  protected getRelationKeys(): string[] {
    return [this.prefixRelatedTable(this.relation.relatedKeyColumnName)]
  }

  /**
   * Prefixes the related table name to a column
   */
  private prefixRelatedTable(column: string) {
    return column.includes('.') ? column : `${this.relatedTable}.${column}`
  }

  /**
   * Adds where constraint to the pivot table
   */
  private addWhereConstraints() {
    const queryAction = this.queryAction()

    /**
     * Eager query constraints
     */
    if (Array.isArray(this.parent)) {
      this.wrapExisting().whereInPivot(
        this.relation.pivotForeignKey,
        unique(
          this.parent.map((model) => {
            return getValue(model, this.relation.localKey, this.relation, queryAction)
          })
        )
      )
      return
    }

    /**
     * Query constraints
     */
    const value = getValue(this.parent, this.relation.localKey, this.relation, queryAction)
    this.wrapExisting().wherePivot(this.relation.pivotForeignKey, value)
  }

  /**
   * Transforms the selected column names by prefixing the
   * table name
   */
  private transformRelatedTableColumns(columns: any[]) {
    if (this.isPivotOnlyQuery) {
      return columns
    }

    return columns.map((column) => {
      if (typeof column === 'string') {
        return this.prefixRelatedTable(this.resolveKey(column))
      }
      return this.transformValue(column)
    })
  }

  /**
   * Applying query constraints to scope them to relationship
   * only.
   */
  protected applyConstraints() {
    if (this.appliedConstraints) {
      return
    }

    this.appliedConstraints = true

    if (this.isPivotOnlyQuery || ['delete', 'update'].includes(this.queryAction())) {
      this.from(this.relation.pivotTable)
      this.addWhereConstraints()
      return
    }

    /**
     * Add select statements only when not running aggregate
     * queries. The end user can still select columns
     */
    if (!this.hasAggregates) {
      /**
       * Select * from related model when user is not cherry-picking
       * keys
       */
      if (!this.cherryPickingKeys) {
        this.select('*')
      }

      /**
       * Select columns from the pivot table
       */
      this.pivotColumns(
        [this.relation.pivotForeignKey, this.relation.pivotRelatedForeignKey]
          .concat(this.relation.pivotColumns)
          .concat(this.relation.pivotTimestamps)
      )
    }

    /**
     * Add inner join between related model and pivot table
     */
    this.innerJoin(
      this.relation.pivotTable,
      `${this.relatedTable}.${this.relation.relatedKeyColumnName}`,
      `${this.relation.pivotTable}.${this.relation.pivotRelatedForeignKey}`
    )

    this.addWhereConstraints()
    return
  }

  /**
   * Select keys from the related table
   */
  public select(...args: any[]): this {
    let columns = args
    if (Array.isArray(args[0])) {
      columns = args[0]
    }

    this.cherryPickingKeys = true
    this.knexQuery.select(this.transformRelatedTableColumns(columns))
    return this
  }

  public where(key: any, operator?: any, value?: any): this {
    return super.where(this.prefixRelatedTable(key), operator, value)
  }

  public orWhere(key: any, operator?: any, value?: any): this {
    return super.orWhere(this.prefixRelatedTable(key), operator, value)
  }

  public andWhere(key: any, operator?: any, value?: any): this {
    return super.andWhere(this.prefixRelatedTable(key), operator, value)
  }

  public whereNot(key: any, operator?: any, value?: any): this {
    return super.whereNot(this.prefixRelatedTable(key), operator, value)
  }

  public orWhereNot(key: any, operator?: any, value?: any): this {
    return super.orWhereNot(this.prefixRelatedTable(key), operator, value)
  }

  public andWhereNot(key: any, operator?: any, value?: any): this {
    return super.andWhereNot(this.prefixRelatedTable(key), operator, value)
  }

  public whereIn(key: any, value: any): this {
    return super.whereIn(this.prefixRelatedTable(key), value)
  }

  public orWhereIn(key: any, value: any): this {
    return super.orWhereIn(this.prefixRelatedTable(key), value)
  }

  public andWhereIn(key: any, value: any): this {
    return super.andWhereIn(this.prefixRelatedTable(key), value)
  }

  public whereNotIn(key: any, value: any): this {
    return super.whereNotIn(this.prefixRelatedTable(key), value)
  }

  public orWhereNotIn(key: any, value: any): this {
    return super.orWhereNotIn(this.prefixRelatedTable(key), value)
  }

  public andWhereNotIn(key: any, value: any): this {
    return super.andWhereNotIn(this.prefixRelatedTable(key), value)
  }

  public whereNull(key: any): this {
    return super.whereNull(this.prefixRelatedTable(key))
  }

  public orWhereNull(key: any): this {
    return super.orWhereNull(this.prefixRelatedTable(key))
  }

  public andWhereNull(key: any): this {
    return super.andWhereNull(this.prefixRelatedTable(key))
  }

  public whereNotNull(key: any): this {
    return super.whereNotNull(this.prefixRelatedTable(key))
  }

  public orWhereNotNull(key: any): this {
    return super.orWhereNotNull(this.prefixRelatedTable(key))
  }

  public andWhereNotNull(key: any): this {
    return super.andWhereNotNull(this.prefixRelatedTable(key))
  }

  public whereBetween(key: any, value: [any, any]): this {
    return super.whereBetween(this.prefixRelatedTable(key), value)
  }

  public orWhereBetween(key: any, value: [any, any]): this {
    return super.orWhereBetween(this.prefixRelatedTable(key), value)
  }

  public andWhereBetween(key: any, value: [any, any]): this {
    return super.andWhereBetween(this.prefixRelatedTable(key), value)
  }

  public whereNotBetween(key: any, value: [any, any]): this {
    return super.whereNotBetween(this.prefixRelatedTable(key), value)
  }

  public orWhereNotBetween(key: any, value: [any, any]): this {
    return super.orWhereNotBetween(this.prefixRelatedTable(key), value)
  }

  public andWhereNotBetween(key: any, value: [any, any]): this {
    return super.andWhereNotBetween(this.prefixRelatedTable(key), value)
  }

  public whereLike(key: any, value: any): this {
    return super.whereLike(this.prefixRelatedTable(key), value)
  }

  public orWhereLike(key: any, value: any): this {
    return super.orWhereLike(this.prefixRelatedTable(key), value)
  }

  public andWhereLike(key: any, value: any): this {
    return super.andWhereLike(this.prefixRelatedTable(key), value)
  }

  public whereILike(key: any, value: any): this {
    return super.whereILike(this.prefixRelatedTable(key), value)
  }

  public orWhereILike(key: any, value: any): this {
    return super.orWhereILike(this.prefixRelatedTable(key), value)
  }

  public andWhereILike(key: any, value: any): this {
    return super.andWhereILike(this.prefixRelatedTable(key), value)
  }

  public whereJson(column: string, value: any): this {
    return super.whereJson(this.prefixRelatedTable(column), value)
  }

  public orWhereJson(column: string, value: any): this {
    return super.orWhereJson(this.prefixRelatedTable(column), value)
  }

  public andWhereJson(column: string, value: any): this {
    return super.andWhereJson(this.prefixRelatedTable(column), value)
  }

  public whereNotJson(column: string, value: any): this {
    return super.whereNotJson(this.prefixRelatedTable(column), value)
  }

  public orWhereNotJson(column: string, value: any): this {
    return super.orWhereNotJson(this.prefixRelatedTable(column), value)
  }

  public andWhereNotJson(column: string, value: any): this {
    return super.andWhereNotJson(this.prefixRelatedTable(column), value)
  }

  public whereJsonSuperset(column: string, value: any): this {
    return super.whereJsonSuperset(this.prefixRelatedTable(column), value)
  }

  public orWhereJsonSuperset(column: string, value: any): this {
    return super.orWhereJsonSuperset(this.prefixRelatedTable(column), value)
  }

  public andWhereJsonSuperset(column: string, value: any): this {
    return super.andWhereJsonSuperset(this.prefixRelatedTable(column), value)
  }

  public whereNotJsonSuperset(column: string, value: any): this {
    return super.whereNotJsonSuperset(this.prefixRelatedTable(column), value)
  }

  public orWhereNotJsonSuperset(column: string, value: any): this {
    return super.orWhereNotJsonSuperset(this.prefixRelatedTable(column), value)
  }

  public andWhereNotJsonSuperset(column: string, value: any): this {
    return super.andWhereNotJsonSuperset(this.prefixRelatedTable(column), value)
  }

  public whereJsonSubset(column: string, value: any): this {
    return super.whereJsonSubset(this.prefixRelatedTable(column), value)
  }

  public orWhereJsonSubset(column: string, value: any): this {
    return super.orWhereJsonSubset(this.prefixRelatedTable(column), value)
  }

  public andWhereJsonSubset(column: string, value: any): this {
    return super.andWhereJsonSubset(this.prefixRelatedTable(column), value)
  }

  public whereNotJsonSubset(column: string, value: any): this {
    return super.whereNotJsonSubset(this.prefixRelatedTable(column), value)
  }

  public orWhereNotJsonSubset(column: string, value: any): this {
    return super.orWhereNotJsonSubset(this.prefixRelatedTable(column), value)
  }

  public andWhereNotJsonSubset(column: string, value: any): this {
    return super.andWhereNotJsonSubset(this.prefixRelatedTable(column), value)
  }

  public whereJsonPath(column: string, jsonPath: string, operator: any, value?: any): this {
    return super.whereJsonPath(this.prefixRelatedTable(column), jsonPath, operator, value)
  }

  public orWhereJsonPath(column: string, jsonPath: string, operator: any, value?: any): this {
    return super.orWhereJsonPath(this.prefixRelatedTable(column), jsonPath, operator, value)
  }

  public andWhereJsonPath(column: string, jsonPath: string, operator: any, value?: any): this {
    return super.andWhereJsonPath(this.prefixRelatedTable(column), jsonPath, operator, value)
  }

  /**
   * Add where clause with pivot table prefix
   */
  public wherePivot(key: any, operator?: any, value?: any): this {
    this.pivotHelpers.wherePivot('and', key, operator, value)
    return this
  }

  /**
   * Add or where clause with pivot table prefix
   */
  public orWherePivot(key: any, operator?: any, value?: any): this {
    this.pivotHelpers.wherePivot('or', key, operator, value)
    return this
  }

  /**
   * Alias for wherePivot
   */
  public andWherePivot(key: any, operator?: any, value?: any): this {
    return this.wherePivot(key, operator, value)
  }

  /**
   * Add where not pivot
   */
  public whereNotPivot(key: any, operator?: any, value?: any): this {
    this.pivotHelpers.wherePivot('not', key, operator, value)
    return this
  }

  /**
   * Add or where not pivot
   */
  public orWhereNotPivot(key: any, operator?: any, value?: any): this {
    this.pivotHelpers.wherePivot('orNot', key, operator, value)
    return this
  }

  /**
   * Alias for `whereNotPivot`
   */
  public andWhereNotPivot(key: any, operator?: any, value?: any): this {
    return this.whereNotPivot(key, operator, value)
  }

  /**
   * Adds where in clause
   */
  public whereInPivot(key: any, value: any) {
    this.pivotHelpers.whereInPivot('and', key, value)
    return this
  }

  /**
   * Adds or where in clause
   */
  public orWhereInPivot(key: any, value: any) {
    this.pivotHelpers.whereInPivot('or', key, value)
    return this
  }

  /**
   * Alias from `whereInPivot`
   */
  public andWhereInPivot(key: any, value: any): this {
    return this.whereInPivot(key, value)
  }

  /**
   * Adds where not in clause
   */
  public whereNotInPivot(key: any, value: any) {
    this.pivotHelpers.whereInPivot('not', key, value)
    return this
  }

  /**
   * Adds or where not in clause
   */
  public orWhereNotInPivot(key: any, value: any) {
    this.pivotHelpers.whereInPivot('orNot', key, value)
    return this
  }

  /**
   * Alias from `whereNotInPivot`
   */
  public andWhereNotInPivot(key: any, value: any): this {
    return this.whereNotInPivot(key, value)
  }

  /**
   * Same as "whereNull", but for the pivot table only
   */
  public whereNullPivot(key: string): this {
    this.pivotHelpers.whereNullPivot('and', key)
    return this
  }

  /**
   * Same as "orWhereNull", but for the pivot table only
   */
  public orWhereNullPivot(key: string): this {
    this.pivotHelpers.whereNullPivot('or', key)
    return this
  }

  /**
   * Same as "andWhereNull", but for the pivot table only
   */
  public andWhereNullPivot(key: string): this {
    return this.whereNullPivot(key)
  }

  /**
   * Same as "whereNotNull", but for the pivot table only
   */
  public whereNotNullPivot(key: string): this {
    this.pivotHelpers.whereNullPivot('not', key)
    return this
  }

  /**
   * Same as "orWhereNotNull", but for the pivot table only
   */
  public orWhereNotNullPivot(key: string): this {
    this.pivotHelpers.whereNullPivot('orNot', key)
    return this
  }

  /**
   * Same as "andWhereNotNull", but for the pivot table only
   */
  public andWhereNotNullPivot(key: string): this {
    return this.whereNotNullPivot(key)
  }

  /**
   * Select pivot columns
   */
  public pivotColumns(columns: string[]): this {
    this.pivotHelpers.pivotColumns(columns)
    return this
  }

  /**
   * Clones query
   */
  public clone() {
    this.applyConstraints()
    const clonedQuery = new ManyToManyQueryBuilder(
      this.knexQuery.clone(),
      this.client,
      this.parent,
      this.relation
    )

    this.applyQueryFlags(clonedQuery)

    clonedQuery.isPivotOnlyQuery = this.isPivotOnlyQuery
    clonedQuery.cherryPickingKeys = this.cherryPickingKeys
    clonedQuery.appliedConstraints = this.appliedConstraints
    clonedQuery.isRelatedPreloadQuery = this.isRelatedPreloadQuery
    clonedQuery.debug(this.debugQueries)
    clonedQuery.reporterData(this.customReporterData)

    return clonedQuery
  }

  /**
   * Paginate through rows inside a given table
   */
  public paginate(page: number, perPage: number = 20) {
    if (this.isRelatedPreloadQuery) {
      throw new Error(`Cannot paginate relationship "${this.relation.relationName}" during preload`)
    }

    this.applyConstraints()
    return super.paginate(page, perPage)
  }

  public async exec() {
    const pivotTimestamps = this.relation.pivotTimestamps.map((timestamp) =>
      this.relation.pivotAlias(timestamp)
    )

    /**
     * Transform pivot timestamps
     */
    if (pivotTimestamps.length) {
      this.rowTransformer((row) => {
        pivotTimestamps.forEach((timestamp) => {
          const timestampValue = row.$extras[timestamp]
          if (!timestampValue) {
            return
          }

          /**
           * Convert from string
           */
          if (typeof timestampValue === 'string') {
            row.$extras[timestamp] = DateTime.fromSQL(timestampValue)
          }

          /**
           * Convert from date
           */
          if (timestampValue instanceof Date) {
            row.$extras[timestamp] = DateTime.fromJSDate(timestampValue)
          }
        })
      })
    }

    return super.exec()
  }

  /**
   * Returns the group limit query
   */
  public getGroupLimitQuery() {
    const { direction, column } = this.groupConstraints.orderBy || {
      column: this.prefixRelatedTable(this.resolveKey(this.relation.relatedModel().primaryKey)),
      direction: 'desc',
    }

    const rowName = 'adonis_group_limit_counter'
    const partitionBy = `PARTITION BY ${this.pivotHelpers.prefixPivotTable(
      this.relation.pivotForeignKey
    )}`
    const orderBy = `ORDER BY ${column} ${direction}`

    /**
     * Select * when no columns are selected
     */
    if (!this.getSelectedColumns()) {
      this.select('*')
    }

    this.select(this.client.raw(`row_number() over (${partitionBy} ${orderBy}) as ${rowName}`)).as(
      'adonis_temp'
    )

    const groupQuery = this.relation.relatedModel().query()
    groupQuery.usePreloader(this.preloader)
    groupQuery.sideload(this.sideloaded)
    groupQuery.debug(this.debugQueries)
    this.customReporterData && groupQuery.reporterData(this.customReporterData)

    return groupQuery.from(this).where(rowName, '<=', this.groupConstraints.limit!)
  }
}
