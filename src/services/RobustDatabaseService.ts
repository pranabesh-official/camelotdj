import { DatabaseService } from './DatabaseService';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: string;
  responseTime: number;
  errorRate: number;
  connectionPool: {
    active: number;
    idle: number;
    total: number;
  };
  database: {
    fileCount: number;
    playlistCount: number;
    lastBackup?: string;
  };
}

export interface DatabaseOperation {
  id: string;
  type: 'read' | 'write' | 'delete' | 'update';
  endpoint: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  retryCount: number;
  error?: string;
}

export class RobustDatabaseService extends DatabaseService {
  private retryConfig: RetryConfig;
  private healthStatus: HealthStatus;
  private operationQueue: Map<string, DatabaseOperation> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isHealthy: boolean = true;
  private consecutiveFailures: number = 0;
  private lastHealthCheck: number = 0;
  private responseTimes: number[] = [];
  private errorCount: number = 0;
  private successCount: number = 0;

  constructor(apiPort: number, apiSigningKey: string, retryConfig?: Partial<RetryConfig>) {
    super(apiPort, apiSigningKey);
    
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      ...retryConfig
    };

    this.healthStatus = {
      status: 'healthy',
      lastCheck: new Date().toISOString(),
      responseTime: 0,
      errorRate: 0,
      connectionPool: { active: 0, idle: 0, total: 0 },
      database: { fileCount: 0, playlistCount: 0 }
    };

    // Start health monitoring
    this.startHealthMonitoring();
  }

  private startHealthMonitoring(): void {
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);

    // Initial health check
    this.performHealthCheck();
  }

  private async performHealthCheck(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Test basic connectivity
      const response = await fetch(`http://127.0.0.1:${this.apiPort}/health`, {
        method: 'GET',
        headers: {
          'X-Signing-Key': this.apiSigningKey,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      const responseTime = Date.now() - startTime;
      this.responseTimes.push(responseTime);
      
      // Keep only last 10 response times for average calculation
      if (this.responseTimes.length > 10) {
        this.responseTimes = this.responseTimes.slice(-10);
      }

      if (response.ok) {
        const data = await response.json();
        this.isHealthy = true;
        this.consecutiveFailures = 0;
        
        this.healthStatus = {
          status: 'healthy',
          lastCheck: new Date().toISOString(),
          responseTime: this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length,
          errorRate: this.errorCount / (this.successCount + this.errorCount) || 0,
          connectionPool: data.connectionPool || { active: 0, idle: 0, total: 0 },
          database: data.database || { fileCount: 0, playlistCount: 0 }
        };
      } else {
        throw new Error(`Health check failed with status ${response.status}`);
      }
    } catch (error) {
      this.consecutiveFailures++;
      this.errorCount++;
      
      const responseTime = Date.now() - startTime;
      this.responseTimes.push(responseTime);
      
      if (this.consecutiveFailures >= 3) {
        this.isHealthy = false;
        this.healthStatus.status = 'unhealthy';
      } else if (this.consecutiveFailures >= 1) {
        this.healthStatus.status = 'degraded';
      }
      
      this.healthStatus.lastCheck = new Date().toISOString();
      this.healthStatus.responseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
      this.healthStatus.errorRate = this.errorCount / (this.successCount + this.errorCount) || 0;
      
      console.warn(`Health check failed (attempt ${this.consecutiveFailures}):`, error);
    }
  }

  private calculateRetryDelay(retryCount: number): number {
    const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, retryCount);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isRetryableError(error: any): boolean {
    if (error.name === 'AbortError') return true;
    if (error.message?.includes('timeout')) return true;
    if (error.message?.includes('network')) return true;
    if (error.message?.includes('fetch')) return true;
    
    // Check for retryable HTTP status codes
    const statusMatch = error.message?.match(/HTTP (\d+)/);
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1]);
      return this.retryConfig.retryableStatusCodes.includes(statusCode);
    }
    
    return false;
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId: string,
    operationType: 'read' | 'write' | 'delete' | 'update',
    endpoint: string
  ): Promise<T> {
    const operationRecord: DatabaseOperation = {
      id: operationId,
      type: operationType,
      endpoint,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0
    };

    this.operationQueue.set(operationId, operationRecord);

    let lastError: any;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        operationRecord.status = attempt > 0 ? 'retrying' : 'pending';
        operationRecord.retryCount = attempt;
        
        const result = await operation();
        
        operationRecord.status = 'success';
        this.successCount++;
        this.operationQueue.delete(operationId);
        
        return result;
      } catch (error) {
        lastError = error;
        operationRecord.error = error instanceof Error ? error.message : String(error);
        
        if (attempt === this.retryConfig.maxRetries) {
          operationRecord.status = 'failed';
          this.errorCount++;
          this.operationQueue.delete(operationId);
          break;
        }
        
        if (!this.isRetryableError(error)) {
          operationRecord.status = 'failed';
          this.errorCount++;
          this.operationQueue.delete(operationId);
          break;
        }
        
        const delay = this.calculateRetryDelay(attempt);
        console.warn(`Operation ${operationId} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), retrying in ${delay}ms:`, error);
        
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Override parent methods with robust error handling
  async getLibrary(statusFilter?: string): Promise<any[]> {
    const operationId = this.generateOperationId();
    
    return this.executeWithRetry(
      () => super.getLibrary(statusFilter),
      operationId,
      'read',
      '/library'
    );
  }

  async deleteSong(songId: string): Promise<void> {
    const operationId = this.generateOperationId();
    
    return this.executeWithRetry(
      () => super.deleteSong(songId),
      operationId,
      'delete',
      `/library/delete/${songId}`
    );
  }

  async deleteSongByPath(filePath: string): Promise<void> {
    const operationId = this.generateOperationId();
    
    return this.executeWithRetry(
      () => super.deleteSongByPath(filePath),
      operationId,
      'delete',
      `/library/delete-by-path`
    );
  }

  async getPlaylists(): Promise<any[]> {
    const operationId = this.generateOperationId();
    
    return this.executeWithRetry(
      () => super.getPlaylists(),
      operationId,
      'read',
      '/playlists'
    );
  }


  async addSongToPlaylist(playlistId: string, musicFileId: string, position?: number): Promise<void> {
    const operationId = this.generateOperationId();
    
    return this.executeWithRetry(
      () => super.addSongToPlaylist(playlistId, musicFileId, position),
      operationId,
      'write',
      `/playlists/${playlistId}/songs`
    );
  }

  async removeSongFromPlaylist(playlistId: string, musicFileId: string): Promise<void> {
    const operationId = this.generateOperationId();
    
    return this.executeWithRetry(
      () => super.removeSongFromPlaylist(playlistId, musicFileId),
      operationId,
      'delete',
      `/playlists/${playlistId}/songs/${musicFileId}`
    );
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    const operationId = this.generateOperationId();
    
    return this.executeWithRetry(
      () => super.deletePlaylist(playlistId),
      operationId,
      'delete',
      `/playlists/${playlistId}`
    );
  }

  // Health and monitoring methods
  getHealthStatus(): HealthStatus {
    return { ...this.healthStatus };
  }

  getOperationQueue(): DatabaseOperation[] {
    return Array.from(this.operationQueue.values());
  }

  getMetrics(): {
    isHealthy: boolean;
    consecutiveFailures: number;
    totalOperations: number;
    successRate: number;
    averageResponseTime: number;
    errorRate: number;
  } {
    const totalOps = this.successCount + this.errorCount;
    return {
      isHealthy: this.isHealthy,
      consecutiveFailures: this.consecutiveFailures,
      totalOperations: totalOps,
      successRate: totalOps > 0 ? this.successCount / totalOps : 1,
      averageResponseTime: this.responseTimes.length > 0 
        ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length 
        : 0,
      errorRate: this.healthStatus.errorRate
    };
  }

  // Circuit breaker pattern
  async executeWithCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.isHealthy && this.consecutiveFailures >= 5) {
      throw new Error('Database service is unhealthy - circuit breaker open');
    }

    try {
      const result = await operation();
      this.consecutiveFailures = 0; // Reset on success
      return result;
    } catch (error) {
      this.consecutiveFailures++;
      throw error;
    }
  }

  // Batch operations with transaction-like behavior
  async executeBatch(operations: Array<() => Promise<any>>): Promise<any[]> {
    const operationId = this.generateOperationId();
    const results: any[] = [];
    const errors: any[] = [];

    try {
      for (const operation of operations) {
        try {
          const result = await this.executeWithRetry(
            operation,
            `${operationId}_${results.length}`,
            'write',
            '/batch'
          );
          results.push(result);
        } catch (error) {
          errors.push(error);
          // Continue with other operations even if one fails
        }
      }

      if (errors.length > 0) {
        console.warn(`Batch operation completed with ${errors.length} errors:`, errors);
      }

      return results;
    } catch (error) {
      console.error('Batch operation failed:', error);
      throw error;
    }
  }

  // Cleanup
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.operationQueue.clear();
  }
}
