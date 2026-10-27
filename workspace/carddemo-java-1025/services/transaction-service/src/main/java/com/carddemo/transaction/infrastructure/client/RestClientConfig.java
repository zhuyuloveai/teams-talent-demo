package com.carddemo.transaction.infrastructure.client;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * 下游调用客户端配置。连接/读取超时 3 秒（docs/design/03-service-decomposition.md §4）。
 */
@Configuration
public class RestClientConfig {

    @Bean
    public RestClient cardRestClient(RestClient.Builder builder,
                                     @Value("${client.card-service.base-url}") String baseUrl,
                                     @Value("${client.connect-timeout:3s}") Duration connectTimeout,
                                     @Value("${client.read-timeout:3s}") Duration readTimeout) {
        return build(builder, baseUrl, connectTimeout, readTimeout);
    }

    @Bean
    public RestClient accountRestClient(RestClient.Builder builder,
                                        @Value("${client.account-service.base-url}") String baseUrl,
                                        @Value("${client.connect-timeout:3s}") Duration connectTimeout,
                                        @Value("${client.read-timeout:3s}") Duration readTimeout) {
        return build(builder, baseUrl, connectTimeout, readTimeout);
    }

    @Bean
    public RestClient marketingRestClient(RestClient.Builder builder,
                                          @Value("${client.marketing-service.base-url}") String baseUrl,
                                          @Value("${client.connect-timeout:3s}") Duration connectTimeout,
                                          @Value("${client.read-timeout:3s}") Duration readTimeout) {
        return build(builder, baseUrl, connectTimeout, readTimeout);
    }

    /** 总账过账（Owner A-03/FEE 合同）：补卡费与冲回的分录组。 */
    @Bean
    public RestClient ledgerRestClient(RestClient.Builder builder,
                                       @Value("${client.ledger-service.base-url}") String baseUrl,
                                       @Value("${client.connect-timeout:3s}") Duration connectTimeout,
                                       @Value("${client.read-timeout:3s}") Duration readTimeout) {
        return build(builder, baseUrl, connectTimeout, readTimeout);
    }

    private static RestClient build(RestClient.Builder builder, String baseUrl,
                                    Duration connectTimeout, Duration readTimeout) {
        ClientHttpRequestFactorySettings settings = ClientHttpRequestFactorySettings.DEFAULTS
                .withConnectTimeout(connectTimeout)
                .withReadTimeout(readTimeout);
        return builder.baseUrl(baseUrl)
                .requestFactory(ClientHttpRequestFactories.get(settings))
                .build();
    }
}
